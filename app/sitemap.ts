import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";

import {
  listSitemapCompanies,
  listSitemapFreelancers,
  listSitemapJobs,
} from "@/lib/db/directory";
import { earlyAccessCutoffFor } from "@/lib/pricing/plans";
import { SITE_URL } from "@/lib/site-url";

/**
 * /sitemap.xml — every public URL, for crawlers.
 *
 * The product's distribution thesis is that job posts, freelancer profiles and
 * company pages are public and indexable. Nothing links to most of them, so
 * this file is how a crawler learns they exist.
 *
 * Two decisions worth knowing about:
 *
 * 1. The early-access window applies here. A crawler is an anonymous visitor,
 *    and an anonymous visitor gets a 404 on a job published less than
 *    EARLY_ACCESS_HOURS ago. Listing those URLs would fill Search Console with
 *    soft-404s and train the crawler to distrust the file, so the sitemap uses
 *    exactly the cutoff a logged-out /jobs query uses.
 * 2. lastModified is only set where a real timestamp exists. The static
 *    marketing and legal pages have no revision record, and inventing
 *    `new Date()` for them tells crawlers everything changed on every fetch,
 *    which is the fastest way to make the field meaningless. /jobs and
 *    /freelancers borrow the newest row they list, which is true.
 */

// Rendered per request. The database is not reachable at build time on Vercel,
// and a sitemap baked at build would freeze today's jobs into the index.
export const dynamic = "force-dynamic";

type StaticEntry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

/**
 * The fixed pages. /jobs and /freelancers are the two index pages a crawler
 * should re-read most often; the legal pages are the ones it can forget about
 * for a month. Priority is relative within this site only.
 */
const STATIC_ENTRIES: StaticEntry[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/jobs", changeFrequency: "hourly", priority: 0.9 },
  { path: "/freelancers", changeFrequency: "daily", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.6 },
  { path: "/removed-employers", changeFrequency: "weekly", priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.3 },
];

const url = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);

/** The newest updatedAt in a list, or undefined when the list is empty. */
function newestOf(rows: { updatedAt: Date }[]): Date | undefined {
  let newest: Date | undefined;
  for (const row of rows) {
    if (!newest || row.updatedAt > newest) newest = row.updatedAt;
  }
  return newest;
}

/**
 * The three row-reads, behind Next's data cache for 15 minutes — the same
 * mechanism getPublicStats already uses. A crawler burst (Google, Bing and
 * three scrapers in the same minute) reads memory instead of re-scanning up
 * to 15,000 rows per hit, and a 15-minute stale window on a sitemap is
 * nothing: crawlers poll on schedules measured in hours.
 */
const readSitemapRows = unstable_cache(
  async (cutoffMs: number | null) => {
    const cutoff = cutoffMs === null ? null : new Date(cutoffMs);
    const [jobs, freelancers, companies] = await Promise.all([
      listSitemapJobs(cutoff),
      listSitemapFreelancers(),
      listSitemapCompanies(),
    ]);
    return { jobs, freelancers, companies };
  },
  ["sitemap-rows"],
  { revalidate: 900 },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cutoff = earlyAccessCutoffFor(null, new Date());
  // Quantized to the cache's own 15-minute window: a raw timestamp would give
  // every request a distinct cache key and defeat the cache entirely. The
  // early-access boundary drifting up to 15 minutes late in the SITEMAP is
  // harmless — the job pages themselves enforce the exact cutoff.
  const BUCKET_MS = 15 * 60 * 1000;
  const bucketedCutoffMs =
    cutoff === null ? null : Math.floor(cutoff.getTime() / BUCKET_MS) * BUCKET_MS;

  const { jobs, freelancers, companies } = await readSitemapRows(bucketedCutoffMs);

  const indexLastModified: Record<string, Date | undefined> = {
    "/jobs": newestOf(jobs),
    "/freelancers": newestOf(freelancers),
  };

  const staticEntries: MetadataRoute.Sitemap = STATIC_ENTRIES.map((entry) => ({
    url: url(entry.path),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
    ...(indexLastModified[entry.path] ? { lastModified: indexLastModified[entry.path] } : {}),
  }));

  const jobEntries: MetadataRoute.Sitemap = jobs.map((job) => ({
    url: url(`/jobs/${job.slug}`),
    lastModified: job.updatedAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const freelancerEntries: MetadataRoute.Sitemap = freelancers.map((profile) => ({
    url: url(`/freelancers/${profile.slug}`),
    lastModified: profile.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const companyEntries: MetadataRoute.Sitemap = companies.map((company) => ({
    url: url(`/companies/${company.slug}`),
    lastModified: company.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...jobEntries, ...freelancerEntries, ...companyEntries];
}
