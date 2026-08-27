import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StartOutreach } from "@/components/messages/start-outreach";
import { ProfileBadge } from "@/components/profile/profile-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceRow } from "@/components/ui/choice";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconArrowRight, IconSearch } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { resolveMessageNotice } from "@/app/dashboard/messages/notices";
import { requireRole } from "@/lib/auth/guards";
import { listSkillsGroupedByCategory } from "@/lib/db/freelancer";
import { COUNTRIES } from "@/lib/geo/countries";
import { freelancerVerificationBadge } from "@/lib/profile/badges";
import { PLAN_COPY } from "@/lib/pricing/catalogue";
import { formatMonthly, priceFor } from "@/lib/pricing/prices";
import { getViewerBand } from "@/lib/services/entitlements";
import { searchCandidatesForUser } from "@/lib/services/candidate-search";
import {
  CANDIDATE_SEARCH_MAX_LENGTH,
  encodeCandidateCursor,
  parseCandidateSearchParams,
  RATE_CEILING,
  type CandidateSearchFilters,
} from "@/lib/validations/candidate-search";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Find candidates",
  // Behind the paid wall, and behind a login. Never indexed.
  robots: { index: false, follow: false },
};

const FILTER_FORM_ID = "candidate-filters";

const LINK_FOCUS =
  "rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const VERIFICATION_LABEL: Record<string, string> = {
  NONE: "Any",
  ID_VERIFIED: "ID verified",
  ID_AND_WORK_VERIFIED: "ID and work verified",
};

/** Current filters as query params, for pagination links. */
function searchQuery(filters: CandidateSearchFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  for (const s of filters.skillSlugs ?? []) params.append("skills", s);
  if (filters.country) params.set("country", filters.country);
  if (filters.rateMin !== undefined) params.set("rateMin", String(filters.rateMin));
  if (filters.rateMax !== undefined) params.set("rateMax", String(filters.rateMax));
  if (filters.verification) params.set("verification", filters.verification);
  if (filters.openToWork) params.set("openToWork", "true");
  if (cursor) params.set("cursor", cursor);
  return params;
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Guarded here, not only in the rail — the caller is curl.
  const { user } = await requireRole("RECRUITER");
  const params = await searchParams;
  const filters = parseCandidateSearchParams(params);
  const notice = resolveMessageNotice(
    typeof params.notice === "string" ? params.notice : undefined,
  );
  const result = await searchCandidatesForUser(user.id, filters);

  if (!result.ok && result.reason === "not-recruiter") redirect("/dashboard");

  if (!result.ok && result.reason === "banned") {
    return (
      <main id="main" className="flex-1">
        <div className="w-full px-6 py-8 lg:px-8">
          <h1 className="t-display-2">Find candidates</h1>
          <Notice tone="error" className="mt-6 max-w-2xl">
            This company has been removed from Talent4u, so candidate search is closed. Your data
            is untouched and your existing conversations are still readable.{" "}
            <Link href="/contact" className={cn("font-medium underline", LINK_FOCUS)}>
              Get in touch
            </Link>{" "}
            if you believe that is a mistake.
          </Notice>
        </div>
      </main>
    );
  }

  // ── The paid wall ────────────────────────────────────────────────────────
  //
  // A whole page, not a disabled button over blurred rows. No result count, no
  // sample, nothing that leaks who is on the platform — the number alone would
  // tell a competitor how deep the talent pool is.
  if (!result.ok) {
    const band = await getViewerBand();
    const growth = priceFor("RECRUITER_GROWTH", band);
    const list = priceFor("RECRUITER_GROWTH", "STANDARD");

    return (
      <main id="main" className="flex-1">
        <div className="w-full px-6 py-8 lg:px-8">
          <header className="mb-6">
            <h1 className="t-display-2">Find candidates</h1>
            <p className="measure mt-3 text-[16px] leading-[26px] text-muted-foreground">
              Search every freelancer on Talent4u by skill, rate, country and availability —
              instead of waiting for the right person to find your post.
            </p>
          </header>

          <div className="surface-card max-w-2xl p-6 sm:p-8">
            <span className="chip chip-lg chip-signal">
              <IconSearch className="size-6" />
            </span>

            <h2 className="t-heading mt-5">Candidate search is on {PLAN_COPY.RECRUITER_GROWTH.name}</h2>
            <p className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
              {PLAN_COPY.RECRUITER_GROWTH.tagline}
            </p>

            <p className="mt-6 flex items-baseline gap-2">
              <span className="t-data tabular text-[32px] leading-none">
                {formatMonthly(growth)}
              </span>
              {growth.isReduced ? (
                <span className="t-data tabular text-[15px] text-muted-foreground line-through">
                  {formatMonthly(list)}
                </span>
              ) : null}
              <span className="text-[15px] text-muted-foreground">a month</span>
            </p>
            {growth.isReduced ? (
              <p className="t-label mt-2 text-success">Regional price for your billing country</p>
            ) : null}

            <ul className="mt-6 space-y-2">
              {[
                "Search headlines and bios, filtered by skill, rate, country and availability",
                "Message people directly instead of waiting for an application",
                "Five active job posts instead of one",
                "Private notes and pipelines on every applicant",
              ].map((line) => (
                <li key={line} className="flex gap-2.5 text-[15px] leading-[22px]">
                  <span aria-hidden className="text-success">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" render={<Link href="/dashboard/billing">See plans</Link>} />
              <Button
                size="lg"
                variant="ghost"
                render={
                  <Link href="/pricing">
                    Compare everything
                    <IconArrowRight />
                  </Link>
                }
              />
            </div>

            <p className="measure mt-6 text-[13px] leading-[18px] text-muted-foreground">
              Posting a job and receiving applications stays free, on every plan, forever. We never
              take a commission from you or from the people you hire.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { candidates, hasMore, nextCursor, countries, openJobs, threads, canInitiate } =
    result.view;
  const RETURN_TO = "/dashboard/recruiter/candidates";
  const skillGroups = await listSkillsGroupedByCategory();
  const selectedSkills = new Set(filters.skillSlugs ?? []);
  const countrySet = new Set(countries);
  const hasFilters =
    Boolean(filters.q) ||
    selectedSkills.size > 0 ||
    Boolean(filters.country) ||
    filters.rateMin !== undefined ||
    filters.rateMax !== undefined ||
    Boolean(filters.verification) ||
    Boolean(filters.openToWork);

  const nextHref = nextCursor
    ? `/dashboard/recruiter/candidates?${searchQuery(filters, encodeCandidateCursor(nextCursor)).toString()}`
    : null;

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <header className="mb-6">
          <h1 className="t-display-2">Find candidates</h1>
          <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
            Every freelancer with a live profile. Pro members appear first — that is what they pay
            for, and it is the only thing that moves the order besides how well they match.
          </p>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-6 max-w-3xl">
            {notice.message}
          </Notice>
        ) : null}

        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[17rem_1fr]">
          {/* Results first in the DOM, rail second: a keyboard user reaches the
              first candidate without tabbing through nine filter controls. */}
          <section
            aria-labelledby="results-heading"
            className="min-w-0 lg:col-start-2 lg:row-start-1"
          >
            <div role="search" className="pb-5">
              <label htmlFor="q" className="sr-only">
                Search candidates by headline or bio
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
                    maxLength={CANDIDATE_SEARCH_MAX_LENGTH}
                    defaultValue={filters.q ?? ""}
                    placeholder="Shopify, data engineering, React Native…"
                    className="pl-10"
                  />
                </div>
                <Button type="submit" form={FILTER_FORM_ID} size="lg">
                  Search
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-3">
              <div className="min-w-0">
                <h2 id="results-heading" className="t-subhead">
                  {hasFilters ? "Matching candidates" : "All candidates"}
                </h2>
                <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
                  {filters.q ? "Best match first" : "Pro members first, then newest"}
                  {hasFilters ? (
                    <>
                      {" · "}
                      <Link href="/dashboard/recruiter/candidates" className={cn("underline hover:text-foreground", LINK_FOCUS)}>
                        clear filters
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <p className="flex items-baseline gap-2">
                <span className="t-data">{candidates.length}</span>
                <span className="t-label text-muted-foreground">
                  on this page{hasMore ? " · more available" : ""}
                </span>
              </p>
            </div>

            {candidates.length === 0 ? (
              <EmptyState
                title="Nobody matches those filters"
                guidance={
                  hasFilters
                    ? "Widen the rate range or drop a skill — filters combine, so each one you add narrows the list further."
                    : "No freelancer has a live profile yet. As people join, they appear here automatically."
                }
                action={
                  hasFilters ? (
                    <Button
                      variant="outline"
                      render={<Link href="/dashboard/recruiter/candidates">Clear filters</Link>}
                    />
                  ) : (
                    <Button render={<Link href="/dashboard/recruiter/jobs/new">Post a job</Link>} />
                  )
                }
              />
            ) : (
              <>
                <ul className="rowset">
                  {candidates.map((c) => (
                    <li key={c.id} className="row-hover px-4 py-4">
                      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
                        <Avatar
                          src={c.avatarUrl}
                          name={c.displayName}
                          size="md"
                          shape="person"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link
                              href={`/freelancers/${c.slug}`}
                              className={cn(
                                "text-[16px] font-semibold leading-[22px] hover:underline",
                                LINK_FOCUS,
                              )}
                            >
                              {c.displayName}
                            </Link>
                            <ProfileBadge spec={freelancerVerificationBadge(c.verification)} />
                            {c.searchBoost ? (
                              <span className="t-label text-muted-foreground">Pro</span>
                            ) : null}
                            {c.isOpenToWork ? (
                              <span className="t-label text-success">Open to work</span>
                            ) : null}
                          </div>

                          <p className="mt-1 text-[15px] leading-[22px] text-muted-foreground">
                            {c.headline}
                          </p>

                          {c.skills.length > 0 ? (
                            <ul className="mt-2.5 flex flex-wrap gap-1.5">
                              {c.skills.slice(0, 6).map(({ skill, yearsExp }) => (
                                <li
                                  key={skill.slug}
                                  className={cn(
                                    "rounded-md px-2.5 py-1 text-[13px] leading-[18px]",
                                    selectedSkills.has(skill.slug)
                                      ? "bg-foreground text-background"
                                      : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {skill.name}
                                  {yearsExp ? ` · ${yearsExp}y` : ""}
                                </li>
                              ))}
                              {c.skills.length > 6 ? (
                                <li className="px-1 py-1 text-[13px] leading-[18px] text-muted-foreground">
                                  +{c.skills.length - 6}
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="t-data whitespace-nowrap">
                            {c.hourlyRateUsd
                              ? `$${c.hourlyRateUsd.toLocaleString("en-US")}/hr`
                              : "—"}
                          </span>
                          <span className="t-label text-muted-foreground">
                            {COUNTRIES.find((x) => x.code === c.country)?.name ?? c.country}
                          </span>
                        </div>

                        {/* The other half of the paid feature: writing to
                            somebody who has not applied. */}
                        <div className="w-full">
                          <StartOutreach
                            freelancerId={c.id}
                            freelancerName={c.displayName}
                            openJobs={openJobs}
                            canInitiate={canInitiate}
                            conversationId={threads.get(c.userId)}
                            returnTo={RETURN_TO}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {nextHref ? (
                  <div className="mt-6">
                    <Button variant="outline" render={<Link href={nextHref}>Next page</Link>} />
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* ── Filters ──────────────────────────────────────────────────── */}
          <aside id="filters" className="lg:col-start-1 lg:row-start-1">
            <h2 className="t-label pb-3 text-muted-foreground">Filters</h2>
            <form
              id={FILTER_FORM_ID}
              method="get"
              action="/dashboard/recruiter/candidates"
              className="surface-card space-y-5 p-5"
            >
              <Field label="Country" htmlFor="country">
                <Select id="country" name="country" defaultValue={filters.country ?? ""}>
                  <option value="">Anywhere</option>
                  {COUNTRIES.filter((c) => countrySet.has(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Verification" htmlFor="verification">
                <Select
                  id="verification"
                  name="verification"
                  defaultValue={filters.verification ?? ""}
                >
                  <option value="">Any</option>
                  {(["ID_VERIFIED", "ID_AND_WORK_VERIFIED"] as const).map((v) => (
                    <option key={v} value={v}>
                      {VERIFICATION_LABEL[v]}
                    </option>
                  ))}
                </Select>
              </Field>

              <fieldset>
                <legend className="t-label text-muted-foreground">Hourly rate, USD</legend>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    aria-label="Minimum hourly rate"
                    name="rateMin"
                    type="number"
                    min={0}
                    max={RATE_CEILING}
                    defaultValue={filters.rateMin ?? ""}
                    placeholder="Min"
                  />
                  <span aria-hidden className="text-muted-foreground">
                    –
                  </span>
                  <Input
                    aria-label="Maximum hourly rate"
                    name="rateMax"
                    type="number"
                    min={0}
                    max={RATE_CEILING}
                    defaultValue={filters.rateMax ?? ""}
                    placeholder="Max"
                  />
                </div>
                <p className="mt-1.5 text-[13px] leading-[18px] text-muted-foreground">
                  Setting either one hides people who have not stated a rate.
                </p>
              </fieldset>

              <ChoiceRow>
                <Checkbox name="openToWork" value="true" defaultChecked={filters.openToWork} />
                Open to work now
              </ChoiceRow>

              <fieldset>
                <legend className="t-label text-muted-foreground">Skills</legend>
                <p className="mt-1 mb-2.5 text-[13px] leading-[18px] text-muted-foreground">
                  Matches anyone with at least one.
                </p>
                <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
                  {skillGroups.map((group) => (
                    <div key={group.slug}>
                      <h3 className="t-label mb-1.5 text-muted-foreground">{group.name}</h3>
                      <ul className="space-y-0.5">
                        {group.skills.map((skill) => (
                          <li key={skill.slug}>
                            <ChoiceRow>
                              <Checkbox
                                name="skills"
                                value={skill.slug}
                                defaultChecked={selectedSkills.has(skill.slug)}
                              />
                              {skill.name}
                            </ChoiceRow>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button type="submit" size="sm">
                  Apply filters
                </Button>
                {hasFilters ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    render={<Link href="/dashboard/recruiter/candidates">Clear</Link>}
                  />
                ) : null}
              </div>
            </form>
          </aside>
        </div>
      </div>
    </main>
  );
}
