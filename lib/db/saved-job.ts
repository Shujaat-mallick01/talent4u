import { Prisma } from "@/lib/generated/prisma/client";
import { isPlausibleId } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * Prisma access for saved jobs. The composite primary key does the heavy
 * lifting: a double-save conflicts (P2002, swallowed — saving twice IS saved),
 * an unsave of nothing deletes zero rows, and both are idempotent by
 * construction rather than by a read-then-write.
 */

export async function saveJob(freelancerId: string, jobId: string): Promise<boolean> {
  if (!isPlausibleId(jobId)) return false;
  try {
    await prisma.savedJob.create({ data: { freelancerId, jobId } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Already saved — the state the caller wanted.
      if (error.code === "P2002") return true;
      // No such job (FK) — a stale bookmark attempt, not an exception.
      if (error.code === "P2003") return false;
    }
    throw error;
  }
}

export async function unsaveJob(freelancerId: string, jobId: string): Promise<void> {
  if (!isPlausibleId(jobId)) return;
  await prisma.savedJob.deleteMany({ where: { freelancerId, jobId } });
}

/** Which of these jobs the viewer has saved — one query for a whole list. */
export async function savedJobIdSet(freelancerId: string, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await prisma.savedJob.findMany({
    where: { freelancerId, jobId: { in: jobIds } },
    select: { jobId: true },
  });
  return new Set(rows.map((r) => r.jobId));
}

/**
 * The saved list, newest bookmark first. Jobs that closed or were removed
 * since saving STAY in the list with their status visible — a vanished
 * bookmark reads as a bug, a "Closed" pill reads as an answer.
 */
export async function listSavedJobs(freelancerId: string, limit = 100) {
  return prisma.savedJob.findMany({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      createdAt: true,
      job: {
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          budgetMinUsd: true,
          budgetMaxUsd: true,
          engagementType: true,
          publishedAt: true,
          recruiter: {
            select: {
              companyName: true,
              tier: true,
              logoUrl: true,
              isBanned: true,
              deactivatedAt: true,
            },
          },
        },
      },
    },
  });
}
