import { cache } from "react";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
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

      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/jobs" className="hover:text-foreground hover:underline">
            ← All jobs
          </Link>
        </nav>

        {view === "closed" ? (
          <p
            role="status"
            className="mb-6 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            This job is closed and no longer accepts applications
            {job.closedAt ? ` (closed ${timeAgo(job.closedAt)})` : ""}.
          </p>
        ) : null}

        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public logo; next/image optimization is Phase 7.
              <img
                src={company.logoUrl}
                alt={`${company.companyName} logo`}
                width={40}
                height={40}
                className="size-10 rounded-md border border-border object-contain"
              />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted text-sm font-semibold text-muted-foreground">
                {company.companyName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <Link
                href={`/companies/${company.slug}`}
                className="font-medium hover:underline"
              >
                {company.companyName}
              </Link>
              <div className="mt-0.5 flex items-center gap-2">
                {/* The tier label is prominent and never softened. */}
                <ProfileBadge spec={tier} />
                <span className="text-xs text-muted-foreground">
                  {countryName(company.country) ?? company.country}
                </span>
              </div>
            </div>
          </div>

          {company.tier === "UNVERIFIED" ? (
            <p
              role="alert"
              className="mt-4 rounded-[2px] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
            >
              <strong>Unverified employer.</strong> This company has confirmed an email address and
              nothing else. Never pay to apply, never do long unpaid test work, and keep
              conversations on the platform until you trust them.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{ENGAGEMENT_LABEL[job.engagementType] ?? job.engagementType}</span>
            {budget ? <span className="font-medium text-foreground">{budget}</span> : null}
            <span>{job.isRemote ? "Fully remote" : (job.location ?? "On-site")}</span>
            <span>{job.category.name}</span>
            {job.publishedAt ? <span>Posted {timeAgo(job.publishedAt)}</span> : null}
            <span>
              {job.applicationCount} {job.applicationCount === 1 ? "applicant" : "applicants"}
            </span>
          </div>
        </header>

        <section className="py-6">
          <h2 className="sr-only">Job description</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{job.description}</div>
        </section>

        {job.skills.length > 0 ? (
          <section className="border-t border-border py-6">
            <h2 className="mb-3 text-sm font-semibold">Skills</h2>
            <ul className="flex flex-wrap gap-2">
              {job.skills.map((s) => (
                <li
                  key={s.skill.slug}
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-sm"
                >
                  {s.skill.name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view === "full" && applyContext ? (
          <section id="apply" className="border-t border-border py-6">
            {notice === "applied" ? (
              <p role="status" className="mb-4 rounded-[2px] border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                Application sent. The employer will see it in their inbox — you can track its
                status from your dashboard.
              </p>
            ) : null}
            {notice === "already_applied" ? (
              <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                You&apos;ve already applied to this job.
              </p>
            ) : null}

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Apply for this job</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Applying is free and Talent4u takes 0% of what you earn.
              </p>
              <div className="mt-4">
                {applyContext.kind === "logged-out" ? (
                  <Button render={<Link href="/signup">Create a free account to apply</Link>} />
                ) : applyContext.kind === "finish-signup" ? (
                  <Button render={<Link href="/onboarding">Finish signing up to apply</Link>} />
                ) : applyContext.kind === "not-freelancer" ? (
                  <p className="text-sm text-muted-foreground">
                    You&apos;re signed in as an employer — only freelancer accounts can apply.
                  </p>
                ) : applyContext.kind === "needs-onboarding" ? (
                  <Button
                    render={
                      <Link href="/onboarding/freelancer">Complete your profile to apply</Link>
                    }
                  />
                ) : applyContext.kind === "already-applied" ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <ProfileBadge spec={applicationStatusBadge(applyContext.status)} />
                    <span className="text-muted-foreground">
                      Applied {timeAgo(applyContext.appliedAt)}.
                    </span>
                    <Link href="/dashboard/freelancer" className="underline hover:text-foreground">
                      Track it on your dashboard
                    </Link>
                  </div>
                ) : applyContext.kind === "quota-exhausted" ? (
                  <div className="rounded-[2px] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                    <p className="font-medium">
                      You&apos;ve used all {applyContext.limit} free applications for this rolling
                      30-day period.
                    </p>
                    <p className="mt-1">
                      {applyContext.nextSlotFreesAt
                        ? `Your next slot frees on ${applyContext.nextSlotFreesAt.toLocaleDateString("en", { month: "short", day: "numeric" })}. `
                        : ""}
                      {proUpsell} removes the limit and adds {EARLY_ACCESS_HOURS}-hour early
                      access — billing launches soon.
                    </p>
                  </div>
                ) : (
                  <ApplyForm jobSlug={job.slug} remaining={applyContext.remaining} />
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
