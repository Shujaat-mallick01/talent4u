import type { Prisma } from "@/lib/generated/prisma/client";

import { prisma } from "./client";

/**
 * Prisma access for the two crawler-facing surfaces: the XML sitemap and the
 * public freelancer index at /freelancers.
 *
 * Everything here answers one question — "which rows may a stranger, or a
 * search engine, be shown?" — so the visibility predicates are exported as
 * pure builders and unit-tested. A sitemap that lists a URL the site then
 * 404s is worse than no sitemap: it is a page of soft-404s in Search Console,
 * and it teaches the crawler to trust the file less.
 *
 * The three rules the predicates encode:
 *   - A job is listable only while ACTIVE, only if its employer is neither
 *     banned nor self-deactivated, and only once it is out of the Pro
 *     early-access window (a crawler is anonymous, so inside the window
 *     /jobs/[slug] 404s for it — see decideJobVisibility).
 *   - A freelancer profile is listable unless the person deactivated it.
 *     Being closed to work does NOT delist the page: /freelancers/[slug]
 *     still renders it, so it belongs in the sitemap. The browse INDEX is
 *     narrower — see PUBLIC_FREELANCER_WHERE.
 *   - A company page is listable unless banned (it moves to
 *     /removed-employers) or self-deactivated.
 */

/**
 * Rows per sitemap section. The protocol allows 50,000 URLs per file, so
 * three sections at this cap plus the static pages stay well inside one file.
 *
 * Deliberately an offset-free `take`, not pagination: past this many rows the
 * fix is Next's generateSitemaps() splitting into /sitemap/[id].xml, fed by a
 * keyset over the same (publishedAt|createdAt DESC, id DESC) order these
 * queries already use — the ordering columns and indexes for that exist
 * today. Until then, the newest N URLs are the ones worth crawl budget.
 */
export const SITEMAP_SECTION_LIMIT = 5000;

/** Profiles per page of the public /freelancers index. */
export const FREELANCER_DIRECTORY_PAGE_SIZE = 50;

/**
 * The deepest ?page= we will serve. Offset pagination costs the database a
 * scan of every skipped row, so an unbounded page number is a free way for
 * anyone to make us read the whole table; and no crawler needs page 10,000.
 */
export const FREELANCER_DIRECTORY_MAX_PAGE = 200;

/**
 * Jobs eligible for the sitemap. `earlyAccessCutoff` is the anonymous
 * viewer's cutoff (now − EARLY_ACCESS_HOURS); pass null only if you mean to
 * list jobs no logged-out reader can open yet.
 */
export function sitemapJobWhere(earlyAccessCutoff: Date | null): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [
    { status: "ACTIVE" },
    { recruiter: { isBanned: false, deactivatedAt: null } },
  ];
  if (earlyAccessCutoff) and.push({ publishedAt: { lte: earlyAccessCutoff } });
  return { AND: and };
}

/** Freelancer profiles whose public page renders for a stranger. */
export const SITEMAP_FREELANCER_WHERE: Prisma.FreelancerProfileWhereInput = {
  deactivatedAt: null,
};

/** Company pages that are neither removed by us nor withdrawn by them. */
export const SITEMAP_COMPANY_WHERE: Prisma.RecruiterProfileWhereInput = {
  isBanned: false,
  deactivatedAt: null,
};

/**
 * The /freelancers index: live profiles that say they are available. Narrower
 * than the sitemap predicate on purpose — a directory of people who are not
 * looking wastes the reader's time, while their individual pages stay public
 * and indexable.
 */
export const PUBLIC_FREELANCER_WHERE: Prisma.FreelancerProfileWhereInput = {
  deactivatedAt: null,
  isOpenToWork: true,
};

export async function listSitemapJobs(
  earlyAccessCutoff: Date | null,
  limit: number = SITEMAP_SECTION_LIMIT,
) {
  return prisma.job.findMany({
    where: sitemapJobWhere(earlyAccessCutoff),
    // Newest first, so a truncated sitemap keeps the freshest URLs.
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { slug: true, updatedAt: true },
  });
}

export async function listSitemapFreelancers(limit: number = SITEMAP_SECTION_LIMIT) {
  return prisma.freelancerProfile.findMany({
    where: SITEMAP_FREELANCER_WHERE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { slug: true, updatedAt: true },
  });
}

export async function listSitemapCompanies(limit: number = SITEMAP_SECTION_LIMIT) {
  return prisma.recruiterProfile.findMany({
    where: SITEMAP_COMPANY_WHERE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { slug: true, updatedAt: true },
  });
}

/**
 * One page of the public freelancer index, newest first.
 *
 * Offset, not keyset. The tradeoff, stated: offset pages can skip or repeat a
 * profile when a new one is created mid-crawl, and deep offsets get slower —
 * which is why FREELANCER_DIRECTORY_MAX_PAGE exists. In exchange, every page
 * has a stable, linkable, crawlable URL (?page=3), which a cursor does not,
 * and this list is the only thing making profile pages reachable by a
 * crawler. The columns for a keyset version — (createdAt DESC, id DESC),
 * served by FreelancerProfile_deactivatedAt_createdAt_idx — are already the
 * sort order here, so the swap is local to this function when it is needed.
 *
 * Reads one row past the page to learn whether a next page exists, rather
 * than paying a count(*) over the table on every render of a public page.
 */
export async function listPublicFreelancers(
  page: number,
  pageSize: number = FREELANCER_DIRECTORY_PAGE_SIZE,
) {
  const rows = await prisma.freelancerProfile.findMany({
    where: PUBLIC_FREELANCER_WHERE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    select: {
      id: true,
      slug: true,
      displayName: true,
      headline: true,
      country: true,
      hourlyRateUsd: true,
      verification: true,
      // The row's visual anchor. One nullable column on rows already read —
      // no join, no extra query, and null simply falls back to initials.
      avatarUrl: true,
      createdAt: true,
    },
  });

  return { profiles: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export type DirectoryFreelancer = Awaited<
  ReturnType<typeof listPublicFreelancers>
>["profiles"][number];

/**
 * The ?page= param of /freelancers, parsed the way lib/validations/job-browse
 * parses browse filters: forgiving, never throwing. These URLs are shared and
 * indexed, so a malformed one falls back to page 1 instead of erroring.
 *
 * NOTE (file ownership, this sprint): this belongs beside parseJobBrowseParams
 * in lib/validations/, and should move there — it is here because the
 * seo-legal stream owns no file under lib/validations/ this sprint.
 */
export function parseDirectoryPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.trim() === "") return 1;
  // Digits only: "2e9", "-3", "2.5" and " 2 " are all noise, not page numbers.
  if (!/^\d+$/.test(value.trim())) return 1;
  const page = Number.parseInt(value.trim(), 10);
  if (page < 1) return 1;
  return Math.min(page, FREELANCER_DIRECTORY_MAX_PAGE);
}
