import type { FlagReason, JobStatus } from "@/lib/generated/prisma/enums";
import type { JobPostInput } from "@/lib/validations/job";

import { prisma } from "./client";

/**
 * Prisma access for jobs. The publish path is a single transaction that
 * locks BOTH the recruiter's profile row (serializing publishes, so the
 * active-post cap cannot be overshot) AND the job row itself (SELECT ... FOR
 * UPDATE), so the safety scan runs on the latest committed text and a
 * concurrent draft edit blocks until publish commits — an owner cannot race
 * a clean scan against an edit that injects flagged content.
 */

/** A job occupies one of the recruiter's plan slots while in these states. */
export const SLOT_STATUSES: readonly JobStatus[] = ["ACTIVE", "PENDING_REVIEW"];

export async function findJobSlugsLike(base: string): Promise<Set<string>> {
  const rows = await prisma.job.findMany({
    where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

export type CreateDraftJobArgs = {
  recruiterId: string;
  slug: string;
  categoryId: string;
  skillIds: string[];
  input: JobPostInput;
};

export async function createDraftJob(args: CreateDraftJobArgs): Promise<{ id: string; slug: string }> {
  const { recruiterId, slug, categoryId, skillIds, input } = args;
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        recruiterId,
        slug,
        title: input.title,
        description: input.description,
        categoryId,
        engagementType: input.engagementType,
        budgetMinUsd: input.budgetMinUsd,
        budgetMaxUsd: input.budgetMaxUsd,
        isRemote: input.isRemote,
        location: input.isRemote ? null : input.location,
        status: "DRAFT",
      },
      select: { id: true, slug: true },
    });
    if (skillIds.length > 0) {
      await tx.skillOnJob.createMany({
        data: skillIds.map((skillId) => ({ jobId: job.id, skillId })),
      });
    }
    return job;
  });
}

export type UpdateDraftJobArgs = {
  jobId: string;
  recruiterId: string;
  categoryId: string;
  skillIds: string[];
  input: JobPostInput;
  /** New slug when the title changed enough to re-derive it (drafts only —
   * the URL was never public, so re-slugging is safe). */
  slug?: string;
};

/** Updates a DRAFT the recruiter owns. Returns false when no such draft. */
export async function updateDraftJob(args: UpdateDraftJobArgs): Promise<boolean> {
  const { jobId, recruiterId, categoryId, skillIds, input, slug } = args;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.job.updateMany({
      where: { id: jobId, recruiterId, status: "DRAFT" },
      data: {
        ...(slug ? { slug } : {}),
        title: input.title,
        description: input.description,
        categoryId,
        engagementType: input.engagementType,
        budgetMinUsd: input.budgetMinUsd,
        budgetMaxUsd: input.budgetMaxUsd,
        isRemote: input.isRemote,
        location: input.isRemote ? null : input.location,
      },
    });
    if (updated.count === 0) return false;
    await tx.skillOnJob.deleteMany({ where: { jobId } });
    if (skillIds.length > 0) {
      await tx.skillOnJob.createMany({
        data: skillIds.map((skillId) => ({ jobId, skillId })),
      });
    }
    return true;
  });
}

/** A DRAFT the recruiter owns, shaped for the edit form. Null otherwise. */
export async function getEditableJobForRecruiter(jobId: string, recruiterId: string) {
  return prisma.job.findFirst({
    where: { id: jobId, recruiterId, status: "DRAFT" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      engagementType: true,
      budgetMinUsd: true,
      budgetMaxUsd: true,
      isRemote: true,
      location: true,
      category: { select: { slug: true } },
      skills: { select: { skill: { select: { slug: true } } } },
    },
  });
}

export async function listJobsForRecruiter(recruiterId: string) {
  return prisma.job.findMany({
    where: { recruiterId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      closedAt: true,
      createdAt: true,
      _count: { select: { applications: true } },
    },
  });
}

export async function countOccupiedSlots(recruiterId: string): Promise<number> {
  return prisma.job.count({
    where: { recruiterId, status: { in: [...SLOT_STATUSES] } },
  });
}

export type PublishJobDbResult =
  | { ok: true; status: Extract<JobStatus, "ACTIVE" | "PENDING_REVIEW"> }
  | { ok: false; reason: "not-publishable" }
  | { ok: false; reason: "banned" }
  | { ok: false; reason: "cap-reached"; used: number };

export type SafetyScan = (text: string) => { reason: FlagReason; matchedTerm: string } | null;

export async function publishJobTx(args: {
  jobId: string;
  recruiterId: string;
  /** Slots the plan allows; null = unlimited. */
  cap: number | null;
  scan: SafetyScan;
}): Promise<PublishJobDbResult> {
  const { jobId, recruiterId, cap, scan } = args;

  return prisma.$transaction(
    async (tx) => {
    // Serialize publishes per recruiter so the cap check cannot race.
    await tx.$queryRaw`SELECT "id" FROM "RecruiterProfile" WHERE "id" = ${recruiterId} FOR UPDATE`;

    // Lock the Job row itself. Without this, a concurrent draft edit could
    // commit new (flagged) text between this read and the status write below,
    // and the scan would run on stale clean text — an auto-publish bypass.
    // With the lock: if the edit committed first, this locking read sees the
    // newest committed row and scans the real text; if we lock first, the
    // edit blocks and its status='DRAFT' predicate re-evaluates to false
    // after we flip the status.
    const jobs = await tx.$queryRaw<
      { status: JobStatus; publishedAt: Date | null; title: string; description: string; location: string | null }[]
    >`SELECT "status", "publishedAt", "title", "description", "location"
      FROM "Job"
      WHERE "id" = ${jobId} AND "recruiterId" = ${recruiterId} AND "status" IN ('DRAFT', 'CLOSED')
      FOR UPDATE`;
    const job = jobs[0];
    if (!job) return { ok: false, reason: "not-publishable" } as const;

    const recruiter = await tx.recruiterProfile.findUniqueOrThrow({
      where: { id: recruiterId },
      select: { tier: true, isBanned: true },
    });
    if (recruiter.isBanned) return { ok: false, reason: "banned" } as const;

    if (cap !== null) {
      const used = await tx.job.count({
        where: { recruiterId, status: { in: [...SLOT_STATUSES] } },
      });
      if (used >= cap) return { ok: false, reason: "cap-reached", used } as const;
    }

    // Scan the text as it exists INSIDE this transaction, under the row lock.
    // Location is included — it is user text rendered publicly like the rest.
    const flag = scan(`${job.title}\n${job.description}\n${job.location ?? ""}`);
    const status = flag ? ("PENDING_REVIEW" as const) : ("ACTIVE" as const);

    await tx.job.update({
      where: { id: jobId },
      data: {
        status,
        // publishedAt is write-once: set on first genuine publication only.
        // A flagged job has not been published; it gets its timestamp when an
        // admin approves it (Phase 4).
        publishedAt: status === "ACTIVE" ? (job.publishedAt ?? new Date()) : job.publishedAt,
        closedAt: null,
        // Snapshot the tier so browse renders the badge without a join.
        recruiterTier: recruiter.tier,
      },
    });

    if (flag) {
      await tx.safetyFlag.create({
        data: {
          jobId,
          reason: flag.reason,
          matchedTerm: flag.matchedTerm,
          isAutomated: true,
          status: "OPEN",
        },
      });
    }

    return { ok: true, status } as const;
    },
    // Wider than the 5s default: lock waits under publish bursts should
    // queue, not abort. The service maps a genuine timeout to a typed error.
    { maxWait: 5000, timeout: 10000 },
  );
}

/** ACTIVE -> CLOSED for a job the recruiter owns. False when no such job. */
export async function closeJobForRecruiter(jobId: string, recruiterId: string): Promise<boolean> {
  const updated = await prisma.job.updateMany({
    where: { id: jobId, recruiterId, status: "ACTIVE" },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  return updated.count > 0;
}

/**
 * PENDING_REVIEW -> DRAFT for a job the recruiter owns: the recruiter's own
 * exit from a held post (e.g. a scanner false positive), freeing the plan
 * slot. The OPEN SafetyFlag rows are deliberately kept for the moderation
 * audit trail, and any re-publish goes back through publishJobTx's in-
 * transaction scan — this path can never move flagged text toward ACTIVE.
 */
export async function withdrawHeldJobForRecruiter(
  jobId: string,
  recruiterId: string,
): Promise<boolean> {
  const updated = await prisma.job.updateMany({
    where: { id: jobId, recruiterId, status: "PENDING_REVIEW" },
    data: { status: "DRAFT" },
  });
  return updated.count > 0;
}

/**
 * The recruiter's currently-open roles, by their USER id.
 *
 * Candidate search never resolves a recruiter profile — it works from the
 * entitlement context, which carries a user id — so this joins through rather
 * than making the caller fetch a profile it does not otherwise need.
 *
 * Only ACTIVE: outreach names the role it is about, and inviting somebody to a
 * draft or a closed post wastes their time.
 */
export async function listOpenJobsForRecruiterUser(
  userId: string,
): Promise<{ id: string; title: string }[]> {
  return prisma.job.findMany({
    where: { status: "ACTIVE", recruiter: { userId } },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true },
    take: 25,
  });
}
