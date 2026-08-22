import { cache } from "react";

import type { Prisma } from "@/lib/generated/prisma/client";
import { isPlausibleSlug } from "@/lib/services/slug";
import type { JobBrowseFilters } from "@/lib/validations/job-browse";

import { prisma } from "./client";

/**
 * The public /jobs browse query. Keyset-paginated over
 * (publishedAt DESC, id DESC), which the Job_status_publishedAt_id_idx serves.
 *
 * The early-access window is a pure query condition (never a cron): when
 * `earlyAccessCutoff` is set, only jobs with publishedAt <= cutoff are
 * visible. Pro freelancers browse with a null cutoff and see everything.
 */

export const JOB_BROWSE_PAGE_SIZE = 12;

/**
 * Pure where-clause construction so the visibility rules are unit-testable.
 *
 * Semantics:
 * - Only ACTIVE jobs, ever.
 * - skills: a job matches if it has ANY of the selected skills.
 * - budget: overlap semantics with NULL as "unbounded" — a job with no stated
 *   budget matches any budget filter.
 * - cursor: strictly after (publishedAt, id) in descending order.
 */
export function buildJobBrowseWhere(
  filters: JobBrowseFilters,
  earlyAccessCutoff: Date | null,
): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [
    { status: "ACTIVE" },
    // A self-deactivated employer's posts hide with their page. Without this,
    // browse serves jobs whose company link and JSON-LD hiringOrganization
    // point at a 404 — and disagrees with the sitemap, which already excludes
    // them. (Banned needs no predicate here: banning REMOVEs the jobs.)
    { recruiter: { deactivatedAt: null } },
  ];

  if (earlyAccessCutoff) {
    and.push({ publishedAt: { lte: earlyAccessCutoff } });
  }
  if (filters.categorySlug) {
    and.push({ category: { slug: filters.categorySlug } });
  }
  if (filters.skillSlugs && filters.skillSlugs.length > 0) {
    and.push({ skills: { some: { skill: { slug: { in: filters.skillSlugs } } } } });
  }
  if (filters.engagementType) {
    and.push({ engagementType: filters.engagementType });
  }
  if (filters.isRemote !== undefined) {
    and.push({ isRemote: filters.isRemote });
  }
  if (filters.recruiterTier) {
    and.push({ recruiterTier: filters.recruiterTier });
  }
  if (filters.budgetMin !== undefined) {
    and.push({ OR: [{ budgetMaxUsd: null }, { budgetMaxUsd: { gte: filters.budgetMin } }] });
  }
  if (filters.budgetMax !== undefined) {
    and.push({ OR: [{ budgetMinUsd: null }, { budgetMinUsd: { lte: filters.budgetMax } }] });
  }
  if (filters.cursor) {
    // Logically implied by the OR below, but this plain lte becomes a b-tree
    // Index Cond boundary, so deep pages start the scan at the cursor
    // timestamp instead of walking from the newest row (verified: 48k heap
    // fetches -> 14 at page ~4000 of 100k rows).
    and.push({ publishedAt: { lte: filters.cursor.publishedAt } });
    and.push({
      OR: [
        { publishedAt: { lt: filters.cursor.publishedAt } },
        { publishedAt: filters.cursor.publishedAt, id: { lt: filters.cursor.id } },
      ],
    });
  }

  return { AND: and };
}

export async function browseJobs(filters: JobBrowseFilters, earlyAccessCutoff: Date | null) {
  // Fetch one extra row to know whether a next page exists.
  const rows = await prisma.job.findMany({
    where: buildJobBrowseWhere(filters, earlyAccessCutoff),
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: JOB_BROWSE_PAGE_SIZE + 1,
    select: {
      id: true,
      slug: true,
      title: true,
      engagementType: true,
      budgetMinUsd: true,
      budgetMaxUsd: true,
      isRemote: true,
      location: true,
      publishedAt: true,
      recruiterTier: true,
      category: { select: { slug: true, name: true } },
      skills: { select: { skill: { select: { slug: true, name: true } } }, take: 6 },
      // Live tier alongside the denormalized recruiterTier: the card badge
      // renders the live value at zero extra query cost (the join is already
      // here); the ?tier= FILTER stays on the indexed snapshot column.
      recruiter: { select: { slug: true, companyName: true, logoUrl: true, tier: true } },
    },
  });

  const page = rows.slice(0, JOB_BROWSE_PAGE_SIZE);

  // Applicant counts batched over just this page's ids (index-ranged on
  // Application.jobId). A relation _count in the select above would compile
  // into an UNFILTERED aggregate over the whole Application table on every
  // render of this public page — O(all applications), forever.
  const counts =
    page.length === 0
      ? []
      : await prisma.application.groupBy({
          by: ["jobId"],
          where: { jobId: { in: page.map((j) => j.id) } },
          _count: true,
        });
  const countByJob = new Map(counts.map((c) => [c.jobId, c._count]));

  return {
    jobs: page.map((j) => ({ ...j, _count: { applications: countByJob.get(j.id) ?? 0 } })),
    hasMore: rows.length > JOB_BROWSE_PAGE_SIZE,
  };
}

export type BrowseJobRow = Awaited<ReturnType<typeof browseJobs>>["jobs"][number];

/**
 * The full public job for /jobs/[slug]. Public columns only; the LIVE
 * recruiter tier is joined (the denormalized Job.recruiterTier serves browse
 * cards; the detail page shows the truthful current state). Visibility rules
 * (status / window / banned) are decided by the caller via
 * decideJobVisibility — this returns any job so metadata and the page can
 * make the same decision from one cached fetch.
 *
 * The applicant count is a deliberate separate query: a relation _count in
 * the select compiles into an unfiltered whole-table aggregate.
 */
export const getPublicJobBySlug = cache(async (slug: string) => {
  if (!isPlausibleSlug(slug)) return null;
  const job = await prisma.job.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      status: true,
      engagementType: true,
      budgetMinUsd: true,
      budgetMaxUsd: true,
      isRemote: true,
      location: true,
      publishedAt: true,
      closedAt: true,
      category: { select: { slug: true, name: true } },
      skills: {
        select: { skill: { select: { slug: true, name: true } } },
        orderBy: { skill: { name: "asc" } },
      },
      recruiter: {
        select: {
          slug: true,
          companyName: true,
          logoUrl: true,
          tier: true,
          isBanned: true,
          // Self-deactivation hides the post exactly like a ban does — the
          // company page it links to is gone.
          deactivatedAt: true,
          country: true,
        },
      },
    },
  });
  if (!job) return null;

  const applicationCount = await prisma.application.count({ where: { jobId: job.id } });
  return { ...job, applicationCount };
});

export type PublicJob = NonNullable<Awaited<ReturnType<typeof getPublicJobBySlug>>>;
