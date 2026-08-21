import { cache } from "react";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import type { ApplicationStatus } from "@/lib/generated/prisma/enums";
import { getApplicationForJob } from "@/lib/db/application";
import { getPublicJobBySlug, type PublicJob } from "@/lib/db/job-browse";
import { getFreelancerProfileByUserId, getUserAuthState } from "@/lib/db/users";
import { timeAgo } from "@/lib/format/time";
import { countryName } from "@/lib/geo/countries";
import { decideJobVisibility, jobPostingJsonLd, type JobViewState } from "@/lib/jobs/jsonld";
import { applicationStatusBadge, recruiterTierBadge } from "@/lib/profile/badges";
import { jsonLdScript } from "@/lib/profile/jsonld";
import { getSession } from "@/lib/auth/session";
import { upsellLine } from "@/lib/pricing/catalogue";
import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";
import { getApplicationQuotaStatus } from "@/lib/services/application";
import { getViewerBand } from "@/lib/services/entitlements";
import { resolveEarlyAccessCutoff } from "@/lib/services/job-browse";
import { SITE_URL } from "@/lib/site-url";

import { ApplyForm } from "./apply-form";

/**
 * Public job detail. SEO-critical, fully server-rendered, works logged-out.
 * The early-access window applies here exactly as on browse — an inside-window
 * job 404s for non-Pro viewers, or sharing a URL would bypass the window.
 * CLOSED jobs render as an archived page: noindex, no JobPosting JSON-LD.
 *
 * Layout follows the console model: the post reads down the left column at a
 * capped measure, and every fact a decision needs — employer, tier, budget,
 * engagement, location — sits in a ruled right-hand panel that stays on screen
 * while you read, with the apply action at the bottom of it. Outcome notices
 * are the first thing under the breadcrumb: a sent application must announce
 * itself above the fold, not five screens down.
 */

const ENGAGEMENT_LABEL: Record<string, string> = {
  HOURLY: "Hourly",
  FIXED: "Fixed price",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

const canonical = (slug: string) => `${SITE_URL}/jobs/${slug}`;

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const shortDate = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });

/** A bare Link carries no focus ring of its own, so every one here gets these. */
const LINK =
  "rounded-[2px] underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// cache()-wrapped so generateMetadata and the page share one execution —
// one job fetch, one cutoff sample, provably identical visibility decisions.
const loadJobView = cache(
  async (
    slug: string,
  ): Promise<{ job: PublicJob; view: Exclude<JobViewState, "not-found"> } | null> => {
    const job = await getPublicJobBySlug(slug);
    if (!job) return null;
    const cutoff = await resolveEarlyAccessCutoff();
    const view = decideJobVisibility(
      { status: job.status, publishedAt: job.publishedAt, recruiterBanned: job.recruiter.isBanned },
      cutoff,
    );
    if (view === "not-found") return null;
    return { job, view };
  },
);

function budgetLabel(job: PublicJob): string | null {
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  const suffix = job.engagementType === "HOURLY" ? "/hr" : "";
  if (job.budgetMinUsd !== null && job.budgetMaxUsd !== null) {
    return `${fmt(job.budgetMinUsd)}–${fmt(job.budgetMaxUsd)}${suffix}`;
  }
  if (job.budgetMinUsd !== null) return `From ${fmt(job.budgetMinUsd)}${suffix}`;
  if (job.budgetMaxUsd !== null) return `Up to ${fmt(job.budgetMaxUsd)}${suffix}`;
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadJobView(slug);
  if (!loaded) return { title: "Job not found", robots: { index: false, follow: false } };

  const { job, view } = loaded;
  const tier = recruiterTierBadge(job.recruiter.tier);
  return {
    title: `${job.title} — ${job.recruiter.companyName}`,
    description: truncate(job.description, 155),
    alternates: { canonical: canonical(slug) },
    openGraph: {
      title: job.title,
      description: truncate(job.description, 155),
      url: canonical(slug),
    },
    // A closed job stays reachable for humans but leaves the index; an open
    // one is indexable. The tier is surfaced in metadata too — an Unverified
    // employer is labeled even in a search snippet.
    robots: view === "closed" ? { index: false, follow: true } : { index: true, follow: true },
    other: { "talent4u:employer-status": tier.label },
  };
}

type ApplyContext =
  | { kind: "logged-out" }
  | { kind: "finish-signup" }
  | { kind: "not-freelancer" }
  | { kind: "needs-onboarding" }
  | { kind: "already-applied"; status: ApplicationStatus; appliedAt: Date }
  | { kind: "can-apply"; remaining: number | null }
  | { kind: "quota-exhausted"; limit: number; nextSlotFreesAt: Date | null };

async function resolveApplyContext(jobId: string): Promise<ApplyContext> {
  const session = await getSession();
  if (!session) return { kind: "logged-out" };
  const account = await getUserAuthState(session.userId);
  if (!account) return { kind: "finish-signup" };
  if (account.role !== "FREELANCER") return { kind: "not-freelancer" };
  if (!account.hasProfile) return { kind: "needs-onboarding" };

  const profile = await getFreelancerProfileByUserId(session.userId);
  if (!profile) return { kind: "needs-onboarding" };

  const existing = await getApplicationForJob(profile.id, jobId);
  if (existing) {
    return { kind: "already-applied", status: existing.status, appliedAt: existing.createdAt };
  }

  const quota = await getApplicationQuotaStatus(session.userId);
  if ("reason" in quota) return { kind: "needs-onboarding" };
  if (quota.remaining !== null && quota.remaining <= 0) {
    return { kind: "quota-exhausted", limit: quota.limit ?? 0, nextSlotFreesAt: quota.nextSlotFreesAt };
  }
  return { kind: "can-apply", remaining: quota.remaining };
}

/** One row of the ruled fact panel: mono label left, tabular value right. */
function Fact({ term, value, first }: { term: string; value: string; first?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-4 py-2.5 ${
        first ? "" : "border-t border-border"
      }`}
    >
      <dt className="t-label shrink-0 text-muted-foreground">{term}</dt>
      <dd className="t-data min-w-0 text-right break-words">{value}</dd>
    </div>
  );
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { slug } = await params;
  const loaded = await loadJobView(slug);
  if (!loaded) notFound();

  const { job, view } = loaded;
  const tier = recruiterTierBadge(job.recruiter.tier);
  const company = job.recruiter;
  const budget = budgetLabel(job);
  const { notice } = await searchParams;
  const applyContext = view === "full" ? await resolveApplyContext(job.id) : null;
  // Quoted at the viewer's own band, never the list price — a logged-out
  // reader gets STANDARD, which is the honest default for an unknown country.
  const proUpsell =
    applyContext?.kind === "quota-exhausted"
      ? upsellLine("FREELANCER_PRO", await getViewerBand())
      : null;

  // Signing in or up from here comes back to this job instead of dumping the
  // reader on a dashboard. The auth pages sanitize and forward ?next=.
  const returnTo = encodeURIComponent(`/jobs/${job.slug}`);
  const engagement = ENGAGEMENT_LABEL[job.engagementType] ?? job.engagementType;
  const location = job.isRemote ? "Remote" : (job.location ?? "On-site");

  const jsonLd =
    view === "full" && job.publishedAt
      ? jobPostingJsonLd({
          title: job.title,
          description: job.description,
          slug: job.slug,
          url: canonical(job.slug),
          datePosted: job.publishedAt,
          engagementType: job.engagementType,
          isRemote: job.isRemote,
          location: job.location,
          budgetMinUsd: job.budgetMinUsd,
          budgetMaxUsd: job.budgetMaxUsd,
          company: {
            name: company.companyName,
            url: `${SITE_URL}/companies/${company.slug}`,
            logoUrl: company.logoUrl,
          },
          companyCountryName: countryName(company.country) ?? company.country,
          companyCountryCode: company.country,
        })
      : null;

  return (
    <main id="main" className="flex-1">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      ) : null}

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 rounded-[2px] text-[15px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <IconArrowLeft className="size-4" />
            All jobs
          </Link>
        </nav>

        {/* Outcomes first. A sent application announces itself here, above the
            title — not below three screens of job description. */}
        {view === "full" && notice === "applied" ? (
          <Notice tone="success" className="mb-6">
            Application sent to {company.companyName}.{" "}
            <Link href="/dashboard/freelancer" className={LINK}>
              Track its status on your dashboard
            </Link>
            .
          </Notice>
        ) : null}
        {view === "full" && notice === "already_applied" ? (
          <Notice tone="info" className="mb-6">
            You already applied to this job — one application per post.{" "}
            <Link href="/dashboard/freelancer" className={LINK}>
              Track it on your dashboard
            </Link>
            .
          </Notice>
        ) : null}
        {view === "closed" ? (
          <Notice tone="info" className="mb-6">
            This job closed{job.closedAt ? ` ${timeAgo(job.closedAt)}` : ""} and no longer accepts
            applications.{" "}
            <Link href={`/jobs?category=${job.category.slug}`} className={LINK}>
              See open {job.category.name} jobs
            </Link>
            .
          </Notice>
        ) : null}

        <header className="border-b border-border pb-6">
          <p className="t-label text-muted-foreground">
            {job.category.name}
            {job.publishedAt ? ` · Posted ${timeAgo(job.publishedAt)}` : ""}
          </p>
          <h1 className="t-heading measure mt-2">{job.title}</h1>
        </header>

        {/* Two columns from lg up. The rail is first in the DOM so a phone gets
            employer, budget and the apply action before the long description,
            and grid placement moves it right on a wide screen. */}
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 pt-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <aside
            aria-label="Job summary"
            className="lg:col-start-2 lg:row-start-1"
          >
            <div className="border border-border lg:sticky lg:top-[4.5rem]">
              <div className="flex items-start gap-3 px-4 py-4">
                {company.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public logo; next/image optimization is Phase 7.
                  <img
                    src={company.logoUrl}
                    alt={`${company.companyName} logo`}
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-[2px] border border-border object-contain"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-[2px] border border-border bg-muted text-[15px] font-semibold text-muted-foreground"
                  >
                    {company.companyName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold leading-tight">
                    <Link
                      href={`/companies/${company.slug}`}
                      className="rounded-[2px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {company.companyName}
                    </Link>
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {/* The tier label is prominent and never softened. */}
                    <ProfileBadge spec={tier} />
                    <span className="t-label text-muted-foreground">
                      {countryName(company.country) ?? company.country}
                    </span>
                  </div>
                </div>
              </div>

              <dl className="border-t border-border">
                <Fact term="Budget" value={budget ?? "Not stated"} first />
                <Fact term="Type" value={engagement} />
                <Fact term="Location" value={location} />
                <Fact
                  term="Applicants"
                  value={String(job.applicationCount)}
                />
                {job.publishedAt ? (
                  <Fact term="Posted" value={shortDate(job.publishedAt)} />
                ) : null}
                {view === "closed" && job.closedAt ? (
                  <Fact term="Closed" value={shortDate(job.closedAt)} />
                ) : null}
              </dl>

              <div className="border-t border-border px-4 py-4">
                <h2 className="t-label text-muted-foreground">Apply</h2>

                {view === "closed" ? (
                  <div className="mt-3">
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      This post is closed. The category page lists everything still open.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3 w-full"
                      render={
                        <Link href={`/jobs?category=${job.category.slug}`}>
                          See open {job.category.name} jobs
                        </Link>
                      }
                    />
                  </div>
                ) : applyContext?.kind === "logged-out" ? (
                  <div className="mt-3">
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      Applying is free and Talent4u takes 0% of what you earn. An account takes an
                      email and nothing else.
                    </p>
                    <Button
                      className="mt-3 w-full"
                      render={
                        <Link href={`/signup?next=${returnTo}`}>Create a free account to apply</Link>
                      }
                    />
                    <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">
                      Already have one?{" "}
                      <Link href={`/signin?next=${returnTo}`} className={LINK}>
                        Sign in
                      </Link>{" "}
                      — you come straight back to this job.
                    </p>
                  </div>
                ) : applyContext?.kind === "finish-signup" ? (
                  <div className="mt-3">
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      Your account needs a role before it can apply. It takes one question.
                    </p>
                    <Button
                      className="mt-3 w-full"
                      render={<Link href="/onboarding">Finish signing up</Link>}
                    />
                  </div>
                ) : applyContext?.kind === "not-freelancer" ? (
                  <div className="mt-3">
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      You&apos;re signed in as an employer. Only freelancer accounts can apply.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3 w-full"
                      render={<Link href="/dashboard/recruiter">Go to your jobs</Link>}
                    />
                  </div>
                ) : applyContext?.kind === "needs-onboarding" ? (
                  <div className="mt-3">
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      Employers read your profile before your letter. Add your skills and rate to
                      apply.
                    </p>
                    <Button
                      className="mt-3 w-full"
                      render={<Link href="/onboarding/freelancer">Complete your profile</Link>}
                    />
                  </div>
                ) : applyContext?.kind === "already-applied" ? (
                  <div className="mt-3">
                    <ProfileBadge spec={applicationStatusBadge(applyContext.status)} />
                    <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
                      You applied {timeAgo(applyContext.appliedAt)}.{" "}
                      <Link href="/dashboard/freelancer" className={LINK}>
                        Track it on your dashboard
                      </Link>
                      .
                    </p>
                  </div>
                ) : applyContext?.kind === "quota-exhausted" ? (
                  <div className="mt-3">
                    <p className="t-label text-warning">No applications left</p>
                    <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
                      You&apos;ve used all {applyContext.limit} free applications in this rolling
                      30-day window.
                      {applyContext.nextSlotFreesAt
                        ? ` Your next slot frees on ${shortDate(applyContext.nextSlotFreesAt)}.`
                        : ""}{" "}
                      {proUpsell} removes the limit and adds {EARLY_ACCESS_HOURS}-hour early access
                      — billing launches soon.
                    </p>
                  </div>
                ) : applyContext?.kind === "can-apply" ? (
                  <div className="mt-3">
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      {applyContext.remaining === null
                        ? "Pro — unlimited applications."
                        : `${applyContext.remaining} of your free applications left in this rolling 30-day window.`}
                    </p>
                    {/* Outline, not red: the red belongs to the button that
                        actually sends the application. */}
                    <Button
                      variant="outline"
                      className="mt-3 w-full"
                      render={<Link href="#apply">Write your application</Link>}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="lg:col-start-1 lg:row-start-1">
            {company.tier === "UNVERIFIED" ? (
              <Notice tone="warning" className="mb-8">
                <strong className="font-semibold">Unverified employer.</strong> This company has
                confirmed an email address and nothing else. Never pay to apply, never take unpaid
                test work longer than 4 hours, and keep the conversation here until you trust them.
              </Notice>
            ) : null}

            <section>
              <h2 className="t-label text-muted-foreground">Job description</h2>
              <div className="t-body measure mt-3 whitespace-pre-wrap">{job.description}</div>
            </section>

            {job.skills.length > 0 ? (
              <section className="mt-8 border-t border-border pt-6">
                <h2 className="t-label text-muted-foreground">Skills</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {job.skills.map((s) => (
                    <li
                      key={s.skill.slug}
                      className="rounded-[2px] border border-border px-2.5 py-1 text-[14px]"
                    >
                      {s.skill.name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {view === "full" && applyContext?.kind === "can-apply" ? (
              <section id="apply" className="mt-8 scroll-mt-20 border-t border-border pt-6">
                <h2 className="t-subhead">Write your application</h2>
                <p className="t-body-dense measure mt-1 text-muted-foreground">
                  Applying is free. Talent4u takes 0% of what you earn — you and{" "}
                  {company.companyName} agree the rate between yourselves.
                </p>
                <div className="mt-5">
                  <ApplyForm jobSlug={job.slug} remaining={applyContext.remaining} />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
