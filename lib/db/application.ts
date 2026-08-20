import type { ApplyToJobInput } from "@/lib/validations/application";

import { prisma } from "./client";

/**
 * Prisma access for applications. The apply path is one transaction that
 * serializes on the FREELANCER's profile row (SELECT ... FOR UPDATE) — the
 * fix agreed in the Phase 0 schema audit — so the rolling-30-day quota's
 * count-then-insert cannot be overshot by concurrent submits. The
 * @@unique([jobId, freelancerId]) constraint backstops one-application-per-
 * job at the database.
 *
 * Window semantics: an application counts while createdAt > (now - window);
 * one aged exactly to the boundary no longer counts. Status is deliberately
 * ignored — withdrawal does not refund quota.
 */

export async function countApplicationsSince(freelancerId: string, since: Date): Promise<number> {
  return prisma.application.count({
    where: { freelancerId, createdAt: { gt: since } },
  });
}

/**
 * The createdAt of the (skip+1)-th oldest counted application. When a
 * freelancer is at/over the limit, the application whose ageing-out actually
 * frees the next slot is the (used - limit + 1)-th oldest — not necessarily
 * the oldest (a lapsed Pro can be far over the limit).
 */
export async function nthOldestApplicationSince(
  freelancerId: string,
  since: Date,
  skip: number,
): Promise<Date | null> {
  const row = await prisma.application.findFirst({
    where: { freelancerId, createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    skip,
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export type ApplyTxResult =
  | { ok: true; applicationId: string; used: number }
  | { ok: false; reason: "quota-exceeded"; used: number }
  | { ok: false; reason: "job-not-available" }
  | { ok: false; reason: "already-applied" };

export async function applyToJobTx(args: {
  jobId: string;
  freelancerId: string;
  /** Applications allowed in the window; null = unlimited (Pro). */
  quota: number | null;
  windowStart: Date;
  /** The viewer's early-access cutoff; null = sees (and may apply to) everything. */
  earlyAccessCutoff: Date | null;
  input: ApplyToJobInput;
}): Promise<ApplyTxResult> {
  const { jobId, freelancerId, quota, windowStart, earlyAccessCutoff, input } = args;

  return prisma.$transaction(
    async (tx) => {
      // Serialize this freelancer's applies so the quota count cannot race.
      await tx.$queryRaw`SELECT "id" FROM "FreelancerProfile" WHERE "id" = ${freelancerId} FOR UPDATE`;

      // The job must be applicable *as this viewer sees the world*: ACTIVE,
      // published outside their early-access cutoff, recruiter not banned.
      const job = await tx.job.findFirst({
        where: {
          id: jobId,
          status: "ACTIVE",
          recruiter: { isBanned: false },
          ...(earlyAccessCutoff ? { publishedAt: { lte: earlyAccessCutoff } } : {}),
        },
        select: { id: true },
      });
      if (!job) return { ok: false, reason: "job-not-available" } as const;

      const existing = await tx.application.findUnique({
        where: { jobId_freelancerId: { jobId, freelancerId } },
        select: { id: true },
      });
      if (existing) return { ok: false, reason: "already-applied" } as const;

      const used = await tx.application.count({
        where: { freelancerId, createdAt: { gt: windowStart } },
      });
      if (quota !== null && used >= quota) {
        return { ok: false, reason: "quota-exceeded", used } as const;
      }

      const application = await tx.application.create({
        data: {
          jobId,
          freelancerId,
          coverLetter: input.coverLetter,
          proposedRateUsd: input.proposedRateUsd,
        },
        select: { id: true },
      });

      return { ok: true, applicationId: application.id, used: used + 1 } as const;
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

/**
 * A recruiter's inbox for one of their jobs: the job (ownership-scoped — a
 * jobId the recruiter does not own resolves to null) plus every application
 * with the applicant's public profile fields. recruiterNote is selected here
 * because this query only ever serves the owning recruiter.
 */
export async function getJobWithApplicationsForRecruiter(jobId: string, recruiterId: string) {
  return prisma.job.findFirst({
    where: { id: jobId, recruiterId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      applications: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          coverLetter: true,
          proposedRateUsd: true,
          status: true,
          viewedAt: true,
          createdAt: true,
          recruiterNote: true,
          freelancer: {
            select: {
              slug: true,
              displayName: true,
              headline: true,
              country: true,
              hourlyRateUsd: true,
              verification: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Marks every SUBMITTED application on an owned job as VIEWED. Idempotent —
 * safe to run on every inbox render.
 */
export async function markSubmittedApplicationsViewed(
  jobId: string,
  recruiterId: string,
): Promise<number> {
  const updated = await prisma.application.updateMany({
    where: { jobId, status: "SUBMITTED", job: { recruiterId } },
    data: { status: "VIEWED", viewedAt: new Date() },
  });
  return updated.count;
}

/**
 * Applies a recruiter-initiated status change, guarded by ownership AND the
 * set of statuses the transition is legal FROM (computed by the service from
 * the transition matrix) — an illegal or raced transition updates 0 rows.
 */
export async function updateApplicationStatusForRecruiter(args: {
  applicationId: string;
  recruiterId: string;
  to: "SHORTLISTED" | "REJECTED";
  allowedFrom: readonly string[];
}): Promise<boolean> {
  const { applicationId, recruiterId, to, allowedFrom } = args;
  return prisma.$transaction(async (tx) => {
    const current = await tx.application.findFirst({
      where: { id: applicationId, job: { recruiterId } },
      select: { status: true, viewedAt: true },
    });
    if (!current) return false;
    // Duplicate decide (double-click, stale tab): the owned row already sits
    // at the target, so report success rather than a false "may have been
    // withdrawn" error. Non-owned ids still read null above and fail
    // identically, so ids remain unprobeable. `to` is only SHORTLISTED or
    // REJECTED, so WITHDRAWN stays terminal.
    if (current.status === to) return true;
    if (!allowedFrom.includes(current.status)) return false;
    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: to,
        // Deciding on an application implies having seen it.
        viewedAt: current.viewedAt ?? new Date(),
      },
    });
    return true;
  });
}

/** Sets/clears the private recruiter note on an owned application. */
export async function setApplicationNoteForRecruiter(
  applicationId: string,
  recruiterId: string,
  note: string | null,
): Promise<boolean> {
  const updated = await prisma.application.updateMany({
    where: { id: applicationId, job: { recruiterId } },
    data: { recruiterNote: note },
  });
  return updated.count > 0;
}

/** This freelancer's application to this job, if any. */
export async function getApplicationForJob(freelancerId: string, jobId: string) {
  return prisma.application.findUnique({
    where: { jobId_freelancerId: { jobId, freelancerId } },
    select: { id: true, status: true, createdAt: true },
  });
}

export async function listApplicationsForFreelancer(freelancerId: string) {
  return prisma.application.findMany({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      proposedRateUsd: true,
      job: {
        select: {
          slug: true,
          title: true,
          status: true,
          recruiter: { select: { companyName: true, slug: true } },
        },
      },
    },
  });
}
