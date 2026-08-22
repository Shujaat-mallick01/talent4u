import type { FlagStatus } from "@/lib/generated/prisma/enums";
import { isPlausibleId } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * Prisma access for the admin moderation queue.
 *
 * Two invariants live here, both stated in schema.prisma:
 *   - Banning a recruiter transitions EVERY job they own to REMOVED in the
 *     same transaction. That transition is what actually removes the posts
 *     from browse; the flag alone would not.
 *   - A job held by the automated scanner has NO publishedAt (it was never
 *     published). Clearing its last open flag is the moment it becomes
 *     public, so that is where the timestamp is finally set — write-once, as
 *     publishJobTx promised.
 */

export type ModerationCounts = {
  openFlags: number;
  openReports: number;
  pendingVerifications: number;
  /** Freelancers waiting on a work-link review. Counted separately from the
   *  recruiter queue because the two decide different things. */
  pendingFreelancerVerifications: number;
};

export async function getModerationCounts(): Promise<ModerationCounts> {
  const [openFlags, openReports, pendingVerifications, pendingFreelancerVerifications] =
    await Promise.all([
      prisma.safetyFlag.count({ where: { status: "OPEN" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.recruiterProfile.count({
        where: { tier: "UNVERIFIED", verificationSubmittedAt: { not: null }, isBanned: false },
      }),
      // Same filter as listPendingFreelancerVerifications, so the number in
      // the header and the rows underneath it can never disagree.
      prisma.freelancerProfile.count({
        where: { verification: "NONE", verificationSubmittedAt: { not: null }, deactivatedAt: null },
      }),
    ]);
  return { openFlags, openReports, pendingVerifications, pendingFreelancerVerifications };
}

export async function listOpenReports(limit = 100) {
  return prisma.report.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      details: true,
      createdAt: true,
      reportedBy: { select: { email: true, role: true } },
    },
  });
}

export type FlagDecisionResult =
  | { ok: true; jobPublished: boolean }
  | { ok: false; reason: "not-found" | "not-open" };

/**
 * Clears a flag as a false positive. When it was the LAST open flag on a held
 * job, the job goes live — and receives its publishedAt now, since a held job
 * has never been published.
 */
export async function clearFlagTx(flagId: string, adminUserId: string): Promise<FlagDecisionResult> {
  if (!isPlausibleId(flagId)) return { ok: false, reason: "not-found" };

  return prisma.$transaction(async (tx) => {
    const target = await tx.safetyFlag.findUnique({
      where: { id: flagId },
      select: { jobId: true },
    });

    // Lock the job FIRST, before claiming the flag, so decisions on sibling
    // flags of one job serialize. Without it, two admins clearing this job's
    // two open flags each read the other as still OPEN — READ COMMITTED reads
    // the last committed version rather than blocking — both decline to
    // publish, and the job strands in PENDING_REVIEW with zero open flags:
    // invisible on browse, gone from this queue, still holding a plan slot.
    // Job-then-flag also matches banRecruiterTx's order, so the two cannot
    // deadlock against each other.
    if (target?.jobId) {
      await tx.$queryRaw`SELECT "id" FROM "Job" WHERE "id" = ${target.jobId} FOR UPDATE`;
    }

    const claimed = await tx.safetyFlag.updateMany({
      where: { id: flagId, status: "OPEN" },
      data: { status: "CLEARED", reviewedBy: adminUserId, reviewedAt: new Date() },
    });
    if (claimed.count === 0) return { ok: false, reason: "not-open" } as const;

    const flag = await tx.safetyFlag.findUnique({
      where: { id: flagId },
      select: { jobId: true, messageId: true },
    });

    // A cleared message flag un-marks the message.
    if (flag?.messageId) {
      await tx.message.updateMany({
        where: { id: flag.messageId },
        data: { isFlagged: false },
      });
    }

    if (!flag?.jobId) return { ok: true, jobPublished: false } as const;

    const stillOpen = await tx.safetyFlag.count({
      where: { jobId: flag.jobId, status: "OPEN" },
    });
    if (stillOpen > 0) return { ok: true, jobPublished: false } as const;

    const job = await tx.job.findUnique({
      where: { id: flag.jobId },
      select: { publishedAt: true, recruiter: { select: { tier: true, isBanned: true } } },
    });
    if (!job || job.recruiter.isBanned) return { ok: true, jobPublished: false } as const;

    // Conditional on the status as well as the id: the job must STILL be held.
    // A plain update-by-id would publish a job the recruiter withdrew to DRAFT
    // (or that a concurrent uphold REMOVED) in the meantime.
    const published = await tx.job.updateMany({
      where: { id: flag.jobId, status: "PENDING_REVIEW" },
      data: {
        status: "ACTIVE",
        // Write-once: a held job has none yet, so this is its first publication.
        publishedAt: job.publishedAt ?? new Date(),
        recruiterTier: job.recruiter.tier,
      },
    });
    return { ok: true, jobPublished: published.count > 0 } as const;
  });
}

/** Upholds a flag: the job is REMOVED; a flagged message stays flagged. */
export async function upholdFlagTx(
  flagId: string,
  adminUserId: string,
): Promise<FlagDecisionResult> {
  if (!isPlausibleId(flagId)) return { ok: false, reason: "not-found" };

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.safetyFlag.updateMany({
      where: { id: flagId, status: "OPEN" },
      data: { status: "UPHELD", reviewedBy: adminUserId, reviewedAt: new Date() },
    });
    if (claimed.count === 0) return { ok: false, reason: "not-open" } as const;

    const flag = await tx.safetyFlag.findUnique({
      where: { id: flagId },
      select: { jobId: true },
    });
    if (flag?.jobId) {
      await tx.job.updateMany({
        where: { id: flag.jobId, status: { in: ["PENDING_REVIEW", "ACTIVE", "DRAFT", "CLOSED"] } },
        data: { status: "REMOVED", closedAt: new Date() },
      });
    }
    return { ok: true, jobPublished: false } as const;
  });
}

export type BanResult = { ok: true; jobsRemoved: number } | { ok: false; reason: "not-found" | "already-banned" };

/**
 * Bans a recruiter. CLAUDE.md/schema invariant: every job they own transitions
 * to REMOVED in the SAME transaction, and their open flags are upheld — the
 * ban is the decision.
 */
export async function banRecruiterTx(args: {
  recruiterId: string;
  reason: string;
  adminUserId: string;
}): Promise<BanResult> {
  const { recruiterId, reason, adminUserId } = args;
  if (!isPlausibleId(recruiterId)) return { ok: false, reason: "not-found" };

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.recruiterProfile.updateMany({
      where: { id: recruiterId, isBanned: false },
      data: { isBanned: true, bannedReason: reason, bannedAt: new Date() },
    });
    if (claimed.count === 0) {
      const exists = await tx.recruiterProfile.count({ where: { id: recruiterId } });
      return { ok: false, reason: exists ? "already-banned" : "not-found" } as const;
    }

    const removed = await tx.job.updateMany({
      where: { recruiterId, status: { not: "REMOVED" } },
      data: { status: "REMOVED", closedAt: new Date() },
    });

    await tx.safetyFlag.updateMany({
      where: { status: "OPEN", job: { recruiterId } },
      data: { status: "UPHELD", reviewedBy: adminUserId, reviewedAt: new Date() },
    });

    return { ok: true, jobsRemoved: removed.count } as const;
  });
}

export async function resolveReport(
  reportId: string,
  status: Extract<FlagStatus, "CLEARED" | "UPHELD">,
): Promise<boolean> {
  if (!isPlausibleId(reportId)) return false;
  const updated = await prisma.report.updateMany({
    where: { id: reportId, status: "OPEN" },
    data: { status },
  });
  return updated.count > 0;
}

/**
 * The public /removed-employers list. Served by the partial index
 * RecruiterProfile_banned_bannedAt_idx (raw SQL in the init migration).
 */
export async function listRemovedEmployers() {
  return prisma.recruiterProfile.findMany({
    where: { isBanned: true },
    orderBy: { bannedAt: "desc" },
    select: {
      id: true,
      companyName: true,
      // The company NAME is self-asserted free text. Publishing it next to an
      // accusation without saying whether we ever verified the identity would
      // overstate what we know, so the tier travels with it.
      tier: true,
      country: true,
      bannedReason: true,
      bannedAt: true,
    },
  });
}

/**
 * The job a flag belongs to, read BEFORE the flag is decided.
 *
 * Clearing a flag marks it CLEARED, so afterwards there is no reliable way
 * back to the post it was about — the notification needs the id captured
 * first.
 */
export async function getSafetyFlagJobId(flagId: string): Promise<string | null> {
  if (!isPlausibleId(flagId)) return null;
  const flag = await prisma.safetyFlag.findUnique({
    where: { id: flagId },
    select: { jobId: true },
  });
  return flag?.jobId ?? null;
}
