import type { Metadata } from "next";
import Link from "next/link";

import { MatchMeter } from "@/components/brand/match-meter";
import { ProfileBadge } from "@/components/profile/profile-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceRow } from "@/components/ui/choice";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, fieldControlProps } from "@/components/ui/field";
import { IconArrowLeft, IconArrowRight, IconFilter, IconSearch } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { browseJobs, type BrowseJobRow } from "@/lib/db/job-browse";
import { listCategories, listSkillsForFilter } from "@/lib/db/taxonomy";
import { timeAgo } from "@/lib/format/time";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";
import { resolveEarlyAccessCutoff } from "@/lib/services/job-browse";
import { getViewerSkillSlugs, scoreJobMatch } from "@/lib/services/job-match";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import {
  encodeJobBrowseCursor,
  JOB_SEARCH_MAX_LENGTH,
  parseJobBrowseParams,
  type JobBrowseFilters,
} from "@/lib/validations/job-browse";

/**
 * Public job browse. SEO surface: fully server-rendered, works logged-out,
 * filters are plain GET params (no client JS involved anywhere on this page).
 * The 6-hour early-access window is applied as a query condition based on the
 * viewer's subscription, resolved server-side.
 *
 * Layout note: the results come FIRST in the DOM and the filter rail second,
 * with CSS grid placing the rail on the left at lg. A keyboard user reaches
 * the first job immediately instead of tabbing through nine filter controls on
 * every page, and on a phone the jobs sit above the fold rather than below the
 * whole form. The "Filters" link in the results header is the one-tab route
 * back down to the form.
 */

/**
 * Current filters (and optionally a cursor) as normalized query params.
 *
 * Every link on this page is built from here — next page, first page, and the
 * canonical — so the keyword goes in first and stays attached through
 * pagination. A search that fell off the "next page" link would silently
 * widen the result set one click in.
 */
function browseQuery(filters: JobBrowseFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
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
//
// Keyword results are the one exception to index:true. A free-text box is an
// unbounded URL space — every typo is a distinct thin page over content that
// already has its own indexable /jobs/[slug] — so ?q= pages are noindex,
// follow: crawlers still walk through to the jobs themselves, and the
// filtered facets that ARE finite (category, skills, tier) keep indexing
// exactly as before.
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
    title: filters.q ? `Jobs matching “${filters.q}”` : "Browse jobs",
    description: DESCRIPTION,
    alternates: { canonical: query ? `${SITE_URL}/jobs?${query}` : `${SITE_URL}/jobs` },
    robots: { index: !filters.q, follow: true },
  };
}

const ENGAGEMENT_LABEL: Record<string, string> = {
  HOURLY: "Hourly",
  FIXED: "Fixed price",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

const TIER_HINT = "Unverified employers have confirmed an email address and nothing more.";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** "$2,000–$8,000", "From $2,000", "Up to $8,000", or null when unstated. */
function budgetRange(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min != null && max != null) return `${usd(min)}–${usd(max)}`;
  if (min != null) return `From ${usd(min)}`;
  if (max != null) return `Up to ${usd(max)}`;
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

/**
 * Column geometry, declared once so the header strip and every row cannot
 * drift apart. Below md the numeric cells fold back into labelled inline
 * pairs, which is why each cell carries its own label rather than relying on
 * the header strip alone.
 */
const COL_MATCH = "w-[88px] shrink-0";
const COL_ROLE = "min-w-[13rem] flex-1";
const COL_BUDGET = "md:w-36";
const COL_APPLICANTS = "md:w-20";
const COL_POSTED = "md:w-32";
const NUM_CELL = "flex items-baseline gap-2 md:block md:text-right";

const LINK_FOCUS =
  "rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The filter form's id. The search input and its submit button sit at the top
 * of the RESULTS column but belong to this form via the HTML `form`
 * attribute, so one GET submission carries the keyword and every filter
 * together. (An element can only own one form, and a form cannot wrap two
 * grid areas — the attribute is what keeps the markup honest without moving
 * the search box into the rail.)
 */
const FILTER_FORM_ID = "job-filters";

/** Human-readable list of what the viewer has narrowed the list down to. */
function describeFilters(
  filters: JobBrowseFilters,
  categoryName: string | undefined,
  skillNames: string[],
): string[] {
  const out: string[] = [];
  // The keyword leads: it is the filter the reader typed, so it is the one
  // they will look for when the count surprises them.
  if (filters.q) out.push(`“${filters.q}”`);
  if (filters.categorySlug) out.push(categoryName ?? filters.categorySlug);
  if (filters.engagementType) {
    out.push((ENGAGEMENT_LABEL[filters.engagementType] ?? filters.engagementType).toLowerCase());
  }
  if (filters.isRemote === true) out.push("remote only");
  if (filters.isRemote === false) out.push("on-site or hybrid");
  if (filters.recruiterTier) {
    out.push(`${recruiterTierBadge(filters.recruiterTier).label.toLowerCase()} employers`);
  }
  const budget = budgetRange(filters.budgetMin, filters.budgetMax);
  if (budget) out.push(budget.charAt(0).toLowerCase() + budget.slice(1));
  // Counted off the parsed slugs, not the resolved names: a slug that is
  // well-formed but not a real skill still narrows the query, so it must still
  // show up as an active filter.
  const skillCount = filters.skillSlugs?.length ?? 0;
  if (skillCount === 1) out.push(skillNames[0] ?? "1 skill");
  else if (skillCount > 1) out.push(`${skillCount} skills`);
  return out;
}

/**
 * Empty-state guidance that names the filter to change, most restrictive
 * first, rather than telling the reader what is absent.
 */
function describeFixes(
  filters: JobBrowseFilters,
  categoryName: string | undefined,
  skillNames: string[],
): string[] {
  const fixes: string[] = [];
  // A keyword is almost always the narrowest thing on the page — one literal
  // substring against three text columns — so it is named first.
  if (filters.q) fixes.push(`search for something broader than “${filters.q}”`);
  const skillCount = filters.skillSlugs?.length ?? 0;
  if (skillCount === 1) fixes.push(`drop the ${skillNames[0] ?? "selected"} skill`);
  else if (skillCount > 1) fixes.push(`drop one of the ${skillCount} skills`);
  if (budgetRange(filters.budgetMin, filters.budgetMax)) fixes.push("widen the budget range");
  if (filters.recruiterTier) {
    fixes.push(
      `include employers outside ${recruiterTierBadge(filters.recruiterTier).label.toLowerCase()}`,
    );
  }
  if (filters.isRemote === true) fixes.push("include on-site roles");
  if (filters.isRemote === false) fixes.push("include remote roles");
  if (filters.engagementType) {
    fixes.push(
      `allow work other than ${(ENGAGEMENT_LABEL[filters.engagementType] ?? filters.engagementType).toLowerCase()}`,
    );
  }
  if (filters.categorySlug) {
    fixes.push(`search every category, not just ${categoryName ?? filters.categorySlug}`);
  }
  return fixes;
}

export default async function JobsBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseJobBrowseParams(params);

  // One skill lookup for the whole page — getViewerSkillSlugs is
  // request-cached, so twelve rows cost one query, not twelve.
  const [cutoff, categories, skills, viewerSkills] = await Promise.all([
    resolveEarlyAccessCutoff(),
    listCategories(),
    listSkillsForFilter(),
    getViewerSkillSlugs(),
  ]);
  const { jobs, hasMore } = await browseJobs(filters, cutoff);

  // The match column exists only for a signed-in freelancer who has told us
  // what they do. Logged-out visitors, recruiters, and a freelancer with an
  // empty skill list all get the layout unchanged — a column of 0% would be
  // a worse answer than no column.
  const matchSkills = viewerSkills !== null && viewerSkills.size > 0 ? viewerSkills : null;
  const showMatch = matchSkills !== null;

  const selectedSkills = new Set(filters.skillSlugs ?? []);
  const selectedSkillNames = skills.filter((s) => selectedSkills.has(s.slug)).map((s) => s.name);
  const categoryName = categories.find((c) => c.slug === filters.categorySlug)?.name;

  const active = describeFilters(filters, categoryName, selectedSkillNames);
  const hasFilters = active.length > 0;

  const noun = jobs.length === 1 ? "job" : "jobs";
  // Only page 1 of an unpaged result set knows the true total, so the caption
  // never claims a number it cannot stand behind.
  const countCaption =
    filters.cursor || hasMore
      ? `${noun} on this page`
      : hasFilters
        ? `${noun} match`
        : `${noun} open`;

  // The empty state names the filter to change — the specific one, most
  // restrictive first — and always carries exactly one way out.
  const fixes = describeFixes(filters, categoryName, selectedSkillNames);
  const primaryFix = fixes[0] ?? "widen one filter";
  const empty = hasFilters
    ? {
        title: "No jobs match these filters",
        guidance: `${primaryFix.charAt(0).toUpperCase()}${primaryFix.slice(1)}${
          fixes[1] ? `, or ${fixes[1]}` : ""
        }. Clearing every filter shows all open jobs, newest first.`,
        actionLabel: "Clear filters",
        actionHref: "/jobs",
      }
    : filters.cursor
      ? {
          title: "That is the end of the list",
          guidance:
            "There is nothing after the last job on the previous page. The newest posts are back on page one.",
          actionLabel: "Go to the first page",
          actionHref: firstPageHref(filters),
        }
      : {
          title: "No jobs are open right now",
          guidance: `Employers publish through the day, and a new post lands here within ${EARLY_ACCESS_HOURS} hours of going live. Put up a profile in the meantime so employers can find you first.`,
          actionLabel: "Create a free profile",
          actionHref: "/signup",
        };

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="border-b border-border pb-6">
          <h1 className="t-display-2">Browse jobs</h1>
          <p className="t-body measure mt-3 text-muted-foreground">
            Every job here is commission-free. You agree a rate directly with the employer and keep
            100% of it — Talent4u never takes a cut and never handles the payment.
          </p>
        </header>

        {/* The early-access window, explained where it applies rather than as a
            grey aside: it is the reason the top of this list is not the top of
            the database, and the reader deserves to know that. */}
        <Notice tone="info" className="mt-6">
          {cutoff ? (
            <>
              Jobs published in the last {EARLY_ACCESS_HOURS} hours go to Pro members first, so this
              list starts {EARLY_ACCESS_HOURS} hours back. Everything below is open to everyone
              right now.{" "}
              <Link href="/pricing" className={cn("font-medium underline", LINK_FOCUS)}>
                See what Pro costs
              </Link>
              .
            </>
          ) : (
            <>
              You have Pro, so this list includes posts published minutes ago. Everyone else sees
              them {EARLY_ACCESS_HOURS} hours after publication.
            </>
          )}
        </Notice>

        <div className="mt-8 grid gap-x-8 gap-y-10 lg:grid-cols-[13rem_1fr]">
          {/* Results first in the DOM; grid places them second on the left-rail
              layout. See the layout note at the top of this file. */}
          <section aria-labelledby="results-heading" className="min-w-0 lg:col-start-2 lg:row-start-1">
            {/* The keyword box leads the results column — it is the control
                people reach for first, so it is not buried seventh in the
                filter rail. It belongs to the filter form through the `form`
                attribute rather than living inside a second form of its own:
                one GET submission carries the keyword AND every checked
                filter, it survives with JavaScript off, and the parsed q
                rides along on every pagination link via browseQuery. */}
            {/* A search landmark, so this is one keystroke away for a screen
                reader rather than a text box somewhere inside the results. */}
            <div role="search" className="pb-6">
              <label htmlFor="q" className="sr-only">
                Search jobs by title, description or company
              </label>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="q"
                    name="q"
                    type="search"
                    form={FILTER_FORM_ID}
                    inputSize="lg"
                    maxLength={JOB_SEARCH_MAX_LENGTH}
                    defaultValue={filters.q ?? ""}
                    placeholder="Search titles, descriptions and companies"
                    className="pl-10"
                  />
                </div>
                {/* The page's one Signal Red element. "Apply filters" below
                    is Ink for the same reason a row action is. */}
                <Button type="submit" form={FILTER_FORM_ID} size="lg">
                  Search
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-3">
              <div className="min-w-0">
                <h2 id="results-heading" className="t-subhead">
                  Open jobs
                </h2>
                <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
                  Newest first
                  {hasFilters ? ` · filtered by ${active.join(", ")}` : ""}
                  {filters.cursor ? " · continued from the previous page" : ""}
                  {hasFilters ? (
                    <>
                      {" · "}
                      <Link href="/jobs" className={cn("underline hover:text-foreground", LINK_FOCUS)}>
                        clear filters
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex items-center gap-5">
                <a
                  href="#filters"
                  className={cn(
                    "t-label inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground",
                    LINK_FOCUS,
                  )}
                >
                  <IconFilter className="size-4" />
                  Filters{hasFilters ? ` · ${active.length}` : ""}
                </a>
                <p className="flex items-baseline gap-2">
                  <span className="t-data">{jobs.length}</span>
                  <span className="t-label text-muted-foreground">{countCaption}</span>
                </p>
              </div>
            </div>

            {jobs.length === 0 ? (
              <EmptyState
                className="mt-6"
                title={empty.title}
                guidance={empty.guidance}
                action={
                  <Button
                    variant="outline"
                    render={<Link href={empty.actionHref}>{empty.actionLabel}</Link>}
                  />
                }
              />
            ) : (
              <>
                {/* The match number is arithmetic, not a black box, so the
                    page says out loud what it counted. A freelancer who
                    disagrees with a score can go and fix the list it was
                    counted against. */}
                {showMatch ? (
                  <p className="mt-6 text-[13px] leading-[18px] text-muted-foreground">
                    Match is the share of each job’s listed skills that are on your profile.{" "}
                    <Link
                      href="/dashboard/freelancer/profile"
                      className={cn("underline hover:text-foreground", LINK_FOCUS)}
                    >
                      Edit your skills
                    </Link>
                    .
                  </p>
                ) : null}

                {/* Column captions sit above the rule, so the rows below keep
                    one continuous hairline. Hidden from assistive tech because
                    each cell carries its own label. */}
                <div
                  aria-hidden
                  className={cn("hidden gap-x-6 px-4 pb-2 md:flex", showMatch ? "mt-4" : "mt-6")}
                >
                  {showMatch ? (
                    <span className={cn("t-label text-muted-foreground", COL_MATCH)}>Match</span>
                  ) : null}
                  <span className={cn("t-label text-muted-foreground", COL_ROLE)}>Role</span>
                  <span className={cn("t-label text-right text-muted-foreground", COL_BUDGET)}>
                    Budget USD
                  </span>
                  <span className={cn("t-label text-right text-muted-foreground", COL_APPLICANTS)}>
                    Applicants
                  </span>
                  <span className={cn("t-label text-right text-muted-foreground", COL_POSTED)}>
                    Posted
                  </span>
                </div>

                {/* Rows sharing one hairline, never cards floating with gaps.
                    Every number is tabular and right-aligned so budget,
                    applicants and age read straight down the page. */}
                <ul className="rowset mt-6 md:mt-0">
                  {jobs.map((job) => {
                    const budget = budgetRange(job.budgetMinUsd, job.budgetMaxUsd);
                    const applicants = job._count.applications;
                    // null when the viewer has no skills on file or the job
                    // lists none — a job with no skills gets no invented score.
                    const match = matchSkills ? scoreJobMatch(matchSkills, job.skills) : null;
                    // Skills the viewer already has come first, so the four
                    // chips that fit are the four that argue for applying.
                    // Array.sort is stable, so the alphabetical order the
                    // query pinned survives inside each group.
                    const chips = matchSkills
                      ? [...job.skills].sort(
                          (a, b) =>
                            Number(matchSkills.has(b.skill.slug)) -
                            Number(matchSkills.has(a.skill.slug)),
                        )
                      : job.skills;
                    const hiddenChips = Math.max(0, chips.length - 4);
                    return (
                      <li key={job.id} className="row-hover px-4 py-4">
                        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                          {/* Meter and role travel as one column so a narrow
                              phone shrinks the title rather than stranding the
                              meter on a line of its own. The 88px + 24px gap
                              means the title starts at the same x as the
                              "Role" caption above, with or without the
                              meter. */}
                          <div className={cn("flex items-start gap-x-6", COL_ROLE)}>
                            {showMatch ? (
                              <div className={cn(COL_MATCH, "pt-0.5")}>
                                {match ? (
                                  <MatchMeter score={match.score} showValue />
                                ) : (
                                  <span className="t-data text-muted-foreground">
                                    <span aria-hidden>—</span>
                                    <span className="sr-only">No skills listed on this job</span>
                                  </span>
                                )}
                              </div>
                            ) : null}

                            <div className="min-w-0 flex-1">
                              <h3 className="text-[16px] font-semibold leading-[22px]">
                                <Link
                                  href={`/jobs/${job.slug}`}
                                  className={cn("hover:underline", LINK_FOCUS)}
                                >
                                  {job.title}
                                </Link>
                              </h3>

                              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-[22px]">
                                {/* The row's visual anchor: a logo when the
                                    company has one, its initials when it does
                                    not. Squared, because companies are not
                                    people. */}
                                <Avatar
                                  name={job.recruiter.companyName}
                                  src={job.recruiter.logoUrl}
                                  size="xs"
                                  shape="company"
                                />
                                <Link
                                  href={`/companies/${job.recruiter.slug}`}
                                  className={cn(
                                    "text-muted-foreground hover:text-foreground hover:underline",
                                    LINK_FOCUS,
                                  )}
                                >
                                  {job.recruiter.companyName}
                                </Link>
                                {/* The tier label is on every row, always — the
                                    LIVE tier from the joined recruiter (the
                                    ?tier= filter uses the indexed snapshot
                                    column). */}
                                <ProfileBadge spec={recruiterTierBadge(job.recruiter.tier)} />
                              </p>

                              <p className="t-label mt-2 text-muted-foreground">
                                {[
                                  ENGAGEMENT_LABEL[job.engagementType] ?? job.engagementType,
                                  job.isRemote ? "Remote" : (job.location ?? "On-site"),
                                  job.category.name,
                                ].join(" · ")}
                              </p>

                              {/* Four chips, then a count. A Mist ground rather
                                  than an outline: at four-plus per row the
                                  hairlines competed with the row rule itself. */}
                              {chips.length > 0 ? (
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                  {chips.slice(0, 4).map((s) => {
                                    const known = matchSkills?.has(s.skill.slug) ?? false;
                                    return (
                                      <li
                                        key={s.skill.slug}
                                        className={cn(
                                          "rounded-[2px] bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.12em] uppercase",
                                          known ? "text-foreground" : "text-muted-foreground",
                                        )}
                                      >
                                        {s.skill.name}
                                        {/* Ink versus Slate is the visual cue;
                                            this is the same fact said out loud,
                                            so it never rests on colour alone. */}
                                        {known ? (
                                          <span className="sr-only"> — on your profile</span>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                  {hiddenChips > 0 ? (
                                    <li className="rounded-[2px] bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                                      +{hiddenChips}
                                      <span className="sr-only"> more skills</span>
                                    </li>
                                  ) : null}
                                </ul>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 md:shrink-0">
                            <div className={cn(NUM_CELL, COL_BUDGET)}>
                              <span className="t-label text-muted-foreground md:sr-only">Budget</span>
                              {budget ? (
                                <span className="t-data whitespace-nowrap">{budget}</span>
                              ) : (
                                <span className="t-data text-muted-foreground">
                                  <span aria-hidden>—</span>
                                  <span className="sr-only">Not stated</span>
                                </span>
                              )}
                            </div>

                            <div className={cn(NUM_CELL, COL_APPLICANTS)}>
                              <span className="t-label text-muted-foreground md:sr-only">
                                Applicants
                              </span>
                              <span className="t-data">{applicants}</span>
                            </div>

                            <div className={cn(NUM_CELL, COL_POSTED)}>
                              <span className="t-label text-muted-foreground md:sr-only">Posted</span>
                              <span className="t-data whitespace-nowrap">
                                {job.publishedAt ? timeAgo(job.publishedAt) : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {filters.cursor || hasMore ? (
                  <nav
                    aria-label="Job list pages"
                    className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4"
                  >
                    <p className="t-label text-muted-foreground">
                      {filters.cursor
                        ? "Continued from an earlier page"
                        : "More jobs on the next page"}
                    </p>
                    <div className="flex items-center gap-2">
                      {filters.cursor ? (
                        <Button
                          variant="ghost"
                          render={
                            <Link href={firstPageHref(filters)}>
                              <IconArrowLeft />
                              First page
                            </Link>
                          }
                        />
                      ) : null}
                      {hasMore ? (
                        <Button
                          variant="outline"
                          render={
                            <Link href={nextPageHref(filters, jobs[jobs.length - 1])}>
                              Next page
                              <IconArrowRight />
                            </Link>
                          }
                        />
                      ) : null}
                    </div>
                  </nav>
                ) : null}
              </>
            )}
          </section>

          {/* Filters — a plain GET form, fully functional without JavaScript. */}
          {/* tabIndex -1 so the "Filters" link above actually moves focus here,
              not just the scroll position. */}
          <aside id="filters" tabIndex={-1} className="lg:col-start-1 lg:row-start-1">
            <h2 className="t-label pb-3 text-muted-foreground">Filters</h2>
            <form
              id={FILTER_FORM_ID}
              method="get"
              action="/jobs"
              className="space-y-5 border-t border-border pt-5"
            >
              <Field label="Category" htmlFor="category">
                <Select id="category" name="category" defaultValue={filters.categorySlug ?? ""}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Engagement" htmlFor="engagement">
                <Select
                  id="engagement"
                  name="engagement"
                  defaultValue={filters.engagementType ?? ""}
                >
                  <option value="">Any</option>
                  {Object.entries(ENGAGEMENT_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Location" htmlFor="remote">
                <Select
                  id="remote"
                  name="remote"
                  defaultValue={filters.isRemote === undefined ? "" : String(filters.isRemote)}
                >
                  <option value="">Anywhere</option>
                  <option value="true">Remote only</option>
                  <option value="false">On-site / hybrid</option>
                </Select>
              </Field>

              <Field label="Employer status" htmlFor="tier" hint={TIER_HINT}>
                <Select
                  {...fieldControlProps("tier", { hint: TIER_HINT })}
                  name="tier"
                  defaultValue={filters.recruiterTier ?? ""}
                >
                  <option value="">Any</option>
                  <option value="TRUSTED">Trusted</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="UNVERIFIED">Unverified</option>
                </Select>
              </Field>

              <fieldset className="space-y-1.5">
                <legend className="text-[15px] font-medium leading-none">Budget (USD)</legend>
                <p id="budget-hint" className="text-[13px] leading-[18px] text-muted-foreground">
                  A job that states no budget still shows up here.
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="budgetMin" className="sr-only">
                      Budget minimum in US dollars
                    </label>
                    <Input
                      id="budgetMin"
                      name="budgetMin"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      defaultValue={filters.budgetMin ?? ""}
                      placeholder="Min"
                      aria-describedby="budget-hint"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor="budgetMax" className="sr-only">
                      Budget maximum in US dollars
                    </label>
                    <Input
                      id="budgetMax"
                      name="budgetMax"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      defaultValue={filters.budgetMax ?? ""}
                      placeholder="Max"
                      aria-describedby="budget-hint"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Kept as a native <details> so the list collapses without any
                  client JS. `display` stays list-item so the disclosure marker
                  survives — a flex summary loses it in Chrome and Safari. */}
              <details open={selectedSkills.size > 0} className="border-t border-border pt-4">
                <summary
                  className={cn("cursor-pointer text-[15px] font-medium leading-none", LINK_FOCUS)}
                >
                  Skills
                  {selectedSkills.size > 0 ? ` · ${selectedSkills.size} selected` : ""}
                </summary>
                <div className="mt-1 max-h-72 overflow-y-auto pr-1">
                  {skills.map((skill) => (
                    <ChoiceRow key={skill.slug}>
                      <Checkbox
                        name="skills"
                        value={skill.slug}
                        defaultChecked={selectedSkills.has(skill.slug)}
                      />
                      {skill.name}
                    </ChoiceRow>
                  ))}
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {/* Ink, not red: the view already spends its one Signal Red
                    on Search at the top of the results column. */}
                <Button type="submit" variant="secondary">
                  Apply filters
                </Button>
                {hasFilters ? (
                  <Button variant="ghost" render={<Link href="/jobs">Clear</Link>} />
                ) : null}
              </div>
            </form>
          </aside>
        </div>
      </div>
    </main>
  );
}
