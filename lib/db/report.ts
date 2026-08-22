import { isPlausibleId } from "@/lib/services/slug";
import type { ReportTargetType } from "@/lib/validations/report";

import { prisma } from "./client";

/**
 * Prisma access for user reports. Every rule about WHO may report WHAT lives in
 * lib/services/report.ts; this file only reads and writes rows.
 *
 * The one thing decided here is what counts as a reportable target: a report
 * whose targetId matches nothing is a row a moderator has to open, read, and
 * throw away, so an id that names nothing never becomes a queue entry.
 */

/**
 * The job behind a report, if it is one a member of the public could have been
 * looking at. ACTIVE and CLOSED are the two statuses /jobs/[slug] renders;
 * DRAFT and PENDING_REVIEW were never public, and REMOVED already went through
 * moderation, so a report naming one of those is either a guess at an id or a
 * stale form.
 */
export async function getReportableJob(jobId: string): Promise<{ id: string } | null> {
  // An implausible id cannot match a row and must not reach Postgres — a
  // %00-decoded NUL byte there is error 22021, which is a 500, not a miss.
  if (!isPlausibleId(jobId)) return null;
  return prisma.job.findFirst({
    where: { id: jobId, status: { in: ["ACTIVE", "CLOSED"] } },
    select: { id: true },
  });
}

/** The company behind a report. Existence is the whole test. */
export async function getReportableCompany(recruiterId: string): Promise<{ id: string } | null> {
  if (!isPlausibleId(recruiterId)) return null;
  return prisma.recruiterProfile.findUnique({
    where: { id: recruiterId },
    select: { id: true },
  });
}

/** How many reports this person has open. The rate limit, counted. */
export async function countOpenReportsForUser(userId: string): Promise<number> {
  return prisma.report.count({ where: { reportedById: userId, status: "OPEN" } });
}

export async function hasOpenReportForTarget(
  userId: string,
  targetType: ReportTargetType,
  targetId: string,
): Promise<boolean> {
  const existing = await prisma.report.findFirst({
    where: { reportedById: userId, targetType, targetId, status: "OPEN" },
    select: { id: true },
  });
  return existing !== null;
}

export type CreateReportArgs = {
  reportedById: string;
  targetType: ReportTargetType;
  targetId: string;
  /** Already translated into the moderator's vocabulary by the service. */
  reason: string;
  details: string | null;
};

export type CreateReportTxResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate" | "too-many-open" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Files the report, re-checking the two limits inside the transaction.
 *
 * The service checks them first — that is where the rules are stated and
 * tested. This is the version that survives a double-submit: without it, two
 * requests from the same person both read "4 open" or both read "no duplicate"
 * under READ COMMITTED and both insert.
 *
 * There is no unique index to lean on (adding one would mean a schema change,
 * and it could not express "open ones only" without a partial index Prisma
 * cannot model), so the reporter's own User row is the lock. Every report by
 * one person serializes behind it; reports by different people never contend.
 */
export async function createReportTx(
  args: CreateReportArgs,
  maxOpen: number,
): Promise<CreateReportTxResult> {
  const { reportedById, targetType, targetId, reason, details } = args;

  return prisma.$transaction(async (tx) => {
    // Guarded: the id always comes from a verified session, but a non-uuid
    // here would be a Postgres cast error (22P02 — a 500) rather than a miss.
    // Skipping the lock still leaves the checks below; it only gives up the
    // serialization, and the FK on reportedById rejects an unknown user.
    if (UUID.test(reportedById)) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${reportedById}::uuid FOR UPDATE`;
    }

    const duplicate = await tx.report.findFirst({
      where: { reportedById, targetType, targetId, status: "OPEN" },
      select: { id: true },
    });
    if (duplicate) return { ok: false, reason: "duplicate" } as const;

    const open = await tx.report.count({ where: { reportedById, status: "OPEN" } });
    if (open >= maxOpen) return { ok: false, reason: "too-many-open" } as const;

    const created = await tx.report.create({
      data: { reportedById, targetType, targetId, reason, details },
      select: { id: true },
    });
    return { ok: true, id: created.id } as const;
  });
}
