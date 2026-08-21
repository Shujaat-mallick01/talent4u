import type { Metadata } from "next";
import Link from "next/link";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { browseJobs, type BrowseJobRow } from "@/lib/db/job-browse";
import { listCategories, listSkillsForFilter } from "@/lib/db/taxonomy";
import { timeAgo } from "@/lib/format/time";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";
import { resolveEarlyAccessCutoff } from "@/lib/services/job-browse";
import { SITE_URL } from "@/lib/site-url";
import {
  encodeJobBrowseCursor,
  parseJobBrowseParams,
  type JobBrowseFilters,
} from "@/lib/validations/job-browse";

/**
 * Public job browse. SEO surface: fully server-rendered, works logged-out,
 * filters are plain GET params (no client JS involved anywhere on this page).
 * The 6-hour early-access window is applied as a query condition based on the
 * viewer's subscription, resolved server-side.
 */

/** Current filters (and optionally a cursor) as normalized query params. */
function browseQuery(filters: JobBrowseFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.categorySlug) params.set("category", filters.categorySlug);
  for (const s of filters.skillSlugs ?? []) params.append("skills", s);
  if (filters.engagementType) params.set("engagement", filters.engagementType);
  if (filters.budgetMin !== undefined) params.set("budgetMin", String(filters.budgetMin));
  if (filters.budgetMax !== undefined) params.set("budgetMax", String(filters.budgetMax));
  if (filters.isRemote !== undefined) params.set("remote", String(filters.isRemote));
  if (filters.recruiterTier) params.set("tier", filters.recruiterTier);
  if (cursor) params.set("cursor", cursor);
  return params;
}

const DESCRIPTION =
  "Commission-free freelance and full-time jobs in AI & automation, full-stack web development, and Shopify. You keep 100% of what you earn.";

// The canonical self-references the NORMALIZED filter/cursor URL (invalid or
// empty params drop out via the parser, so form-noise variants like
// ?category=&remote= still canonicalize to bare /jobs). Pointing every cursor
// page's canonical at page 1 would tell crawlers the deep pages are
// duplicates and suppress their content.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const filters = parseJobBrowseParams(await searchParams);
  const query = browseQuery(
    filters,
    filters.cursor ? encodeJobBrowseCursor(filters.cursor) : undefined,
  ).toString();
  return {
    // The root layout's title template appends the brand.
    title: "Browse jobs",
    description: DESCRIPTION,
    alternates: { canonical: query ? `${SITE_URL}/jobs?${query}` : `${SITE_URL}/jobs` },
    robots: { index: true, follow: true },
  };
}

const ENGAGEMENT_LABEL: Record<string, string> = {
  HOURLY: "Hourly",
  FIXED: "Fixed price",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

function budgetLabel(job: BrowseJobRow): string | null {
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (job.budgetMinUsd !== null && job.budgetMaxUsd !== null) {
    return `${fmt(job.budgetMinUsd)}–${fmt(job.budgetMaxUsd)}`;
  }
  if (job.budgetMinUsd !== null) return `From ${fmt(job.budgetMinUsd)}`;
  if (job.budgetMaxUsd !== null) return `Up to ${fmt(job.budgetMaxUsd)}`;
  return null;
}

/** The next-page URL: current filters plus the cursor of the last row. */
function nextPageHref(filters: JobBrowseFilters, lastRow: BrowseJobRow): string {
  const cursor = lastRow.publishedAt
    ? encodeJobBrowseCursor({ publishedAt: lastRow.publishedAt, id: lastRow.id })
    : undefined;
  return `/jobs?${browseQuery(filters, cursor).toString()}`;
}

/** Page 1 of the CURRENT filtered result set (filters kept, cursor dropped). */
function firstPageHref(filters: JobBrowseFilters): string {
  const query = browseQuery(filters).toString();
  return query ? `/jobs?${query}` : "/jobs";
}

export default async function JobsBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseJobBrowseParams(params);

  const [cutoff, categories, skills] = await Promise.all([
    resolveEarlyAccessCutoff(),
    listCategories(),
    listSkillsForFilter(),
  ]);
  const { jobs, hasMore } = await browseJobs(filters, cutoff);

  const selectedSkills = new Set(filters.skillSlugs ?? []);

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Browse jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            0% commission — you keep everything you earn.
            {cutoff ? (
              <>
                {" "}
                Pro members see new posts {EARLY_ACCESS_HOURS} hours before everyone else.
              </>
            ) : (
              <> You&apos;re seeing brand-new posts with Pro early access.</>
            )}
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          {/* Filters — a plain GET form, fully functional without JavaScript. */}
          <aside>
            <form method="get" action="/jobs" className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="category" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  defaultValue={filters.categorySlug ?? ""}
                  className="h-9 w-full rounded-md border border-border bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="engagement" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Engagement
                </label>
                <select
                  id="engagement"
                  name="engagement"
                  defaultValue={filters.engagementType ?? ""}
                  className="h-9 w-full rounded-md border border-border bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Any</option>
                  {Object.entries(ENGAGEMENT_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="remote" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Location
                </label>
                <select
                  id="remote"
                  name="remote"
                  defaultValue={filters.isRemote === undefined ? "" : String(filters.isRemote)}
                  className="h-9 w-full rounded-md border border-border bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Anywhere</option>
                  <option value="true">Remote only</option>
                  <option value="false">On-site / hybrid</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="tier" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Employer status
                </label>
                <select
                  id="tier"
                  name="tier"
                  defaultValue={filters.recruiterTier ?? ""}
                  className="h-9 w-full rounded-md border border-border bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Any</option>
                  <option value="TRUSTED">Trusted</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="UNVERIFIED">Unverified</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Budget (USD)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Budget minimum"
                    name="budgetMin"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={filters.budgetMin ?? ""}
                    placeholder="Min"
                    className="h-9 w-full rounded-md border border-border bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                  <input
                    aria-label="Budget maximum"
                    name="budgetMax"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={filters.budgetMax ?? ""}
                    placeholder="Max"
                    className="h-9 w-full rounded-md border border-border bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>
              </div>

              <details open={selectedSkills.size > 0} className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Skills{selectedSkills.size > 0 ? ` (${selectedSkills.size})` : ""}
                </summary>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {skills.map((skill) => (
                    <label key={skill.slug} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="skills"
                        value={skill.slug}
                        defaultChecked={selectedSkills.has(skill.slug)}
                        className="size-4 rounded border-border"
                      />
                      {skill.name}
                    </label>
                  ))}
                </div>
              </details>

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm">
                  Apply filters
                </Button>
                <Button size="sm" variant="ghost" render={<Link href="/jobs">Reset</Link>} />
              </div>
            </form>
          </aside>

          {/* Results */}
          <section>
            {jobs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No jobs match these filters. Try removing one or two.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {jobs.map((job) => (
                  <li key={job.id} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring/60">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/jobs/${job.slug}`}
                          className="text-base font-semibold hover:underline"
                        >
                          {job.title}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                          <Link
                            href={`/companies/${job.recruiter.slug}`}
                            className="hover:text-foreground hover:underline"
                          >
                            {job.recruiter.companyName}
                          </Link>
                          {/* The tier label is on every card, always — the
                              LIVE tier from the joined recruiter (the ?tier=
                              filter uses the indexed snapshot column). */}
                          <ProfileBadge spec={recruiterTierBadge(job.recruiter.tier)} />
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {job.publishedAt ? timeAgo(job.publishedAt) : ""}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{ENGAGEMENT_LABEL[job.engagementType] ?? job.engagementType}</span>
                      {budgetLabel(job) ? (
                        <span className="font-medium text-foreground">{budgetLabel(job)}</span>
                      ) : null}
                      <span>{job.isRemote ? "Remote" : (job.location ?? "On-site")}</span>
                      <span>{job.category.name}</span>
                      <span>
                        {job._count.applications}{" "}
                        {job._count.applications === 1 ? "applicant" : "applicants"}
                      </span>
                    </div>

                    {job.skills.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {job.skills.map((s) => (
                          <li
                            key={s.skill.slug}
                            className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {s.skill.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex items-center justify-between">
              {filters.cursor ? (
                <Link
                  href={firstPageHref(filters)}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  ← First page
                </Link>
              ) : (
                <span />
              )}
              {hasMore && jobs.length > 0 ? (
                <Button
                  variant="outline"
                  render={<Link href={nextPageHref(filters, jobs[jobs.length - 1])}>Next page →</Link>}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
