import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StartThread } from "@/components/messages/start-thread";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/guards";
import { timeAgo } from "@/lib/format/time";
import type { ApplicationStatus, JobStatus } from "@/lib/generated/prisma/enums";
import { countryName } from "@/lib/geo/countries";
import {
  applicationStatusBadge,
  freelancerVerificationBadge,
  jobStatusBadge,
} from "@/lib/profile/badges";
import { upsellLine } from "@/lib/pricing/catalogue";
import { mapApplicationConversations } from "@/lib/db/message";
import { getEntitlementContext } from "@/lib/db/users";
import { getEntitlements } from "@/lib/pricing/entitlements";
import { getJobInboxForUser } from "@/lib/services/application";
import { getViewerBand } from "@/lib/services/entitlements";
import { cn } from "@/lib/utils";

import { resolveInboxNotice } from "../../../notices";
import { decideApplication, saveApplicationNote } from "../../actions";

/**
 * The application inbox for one owned job — the paying recruiter's core
 * screen, so it is built to be scanned at 50 rows rather than read at 3.
 *
 * The pipeline strip at the top doubles as the filter: the counts show the
 * shape of the queue, and clicking one narrows the list. Filtering and sorting
 * happen HERE, over the rows the service already returned — no service call,
 * query or authorization behaviour changes with the query string.
 *
 * Opening the page still marks SUBMITTED applications VIEWED (service-side,
 * idempotent), which is why "To review" counts SUBMITTED and VIEWED together:
 * by the time this renders, nothing is SUBMITTED any more.
 *
 * Recruiter notes are Growth+ — the gate lives in the service; hiding the
 * field here is cosmetic per CLAUDE.md.
 */

/** Short, tabular, unambiguous: "12 Aug". The full date rides along as a title. */
const shortDate = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" });
const longDate = new Intl.DateTimeFormat("en", { dateStyle: "long" });

type FilterKey = "all" | "review" | "shortlisted" | "rejected" | "withdrawn";

type Filter = {
  key: FilterKey;
  label: string;
  /** null = every status. */
  statuses: readonly ApplicationStatus[] | null;
  /** Used in the empty-view copy: "Nothing is …". */
  nothingYet: string;
};

const FILTERS: readonly Filter[] = [
  { key: "all", label: "All", statuses: null, nothingYet: "here" },
  {
    key: "review",
    label: "To review",
    statuses: ["SUBMITTED", "VIEWED"],
    nothingYet: "waiting on your decision",
  },
  {
    key: "shortlisted",
    label: "Shortlisted",
    statuses: ["SHORTLISTED"],
    nothingYet: "shortlisted",
  },
  {
    key: "rejected",
    label: "Not selected",
    statuses: ["REJECTED"],
    nothingYet: "marked as not selected",
  },
  {
    key: "withdrawn",
    label: "Withdrawn",
    statuses: ["WITHDRAWN"],
    nothingYet: "withdrawn",
  },
];

type SortKey = "newest" | "oldest" | "rate";

const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "rate", label: "Highest rate" },
];

/** Column widths live here so the header strip and every row cannot drift. */
const COL = {
  applicant: "min-w-[13rem] flex-1",
  country: "hidden w-28 shrink-0 lg:block",
  rate: "w-32 shrink-0 text-right",
  applied: "w-16 shrink-0 text-right",
  status: "w-32 shrink-0",
  decision: "w-44 shrink-0",
};

const SUMMARY_CLASSES = [
  "t-label inline-flex min-h-11 cursor-pointer list-none items-center gap-2",
  "text-muted-foreground hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "[&::-webkit-details-marker]:hidden",
].join(" ");

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** Why an unpublished post has no applications, and what to do about it. */
function offlineGuidance(status: JobStatus): string {
  switch (status) {
    case "DRAFT":
      return "This post is still a draft, so nobody can find it. Publish it from your jobs list, then share the public link.";
    case "PENDING_REVIEW":
      return "This post is held for a human safety check, so nobody can see it yet. There is nothing to do on your side — it goes live once it clears.";
    case "REMOVED":
      return "This post was removed by moderation, so it cannot receive applications. Your jobs list shows what to fix before posting again.";
    default:
      return "This post is closed, so it is not accepting applications. Reopen it from your jobs list, then share the public link.";
  }
}

export default async function JobApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; status?: string; sort?: string }>;
}) {
  const { user } = await requireRole("RECRUITER");

  const { id } = await params;
  // The service owns the remaining walls (profile, banned, ownership), so
  // there is no duplicate profile query here.
  const inbox = await getJobInboxForUser(user.id, id);
  if (!inbox.ok) {
    if (inbox.reason === "not-found") notFound();
    if (inbox.reason === "no-recruiter-profile") redirect("/onboarding/recruiter");
    redirect("/dashboard/recruiter");
  }

  const { job, canUseNotes } = inbox;

  // Which applicants already have a thread, in one query rather than one per
  // row — and whether this company is allowed to write first at all.
  const [threads, context] = await Promise.all([
    mapApplicationConversations(
      job.applications.map((a) => a.id),
      user.id,
    ),
    getEntitlementContext(user.id),
  ]);
  const canInitiate = context
    ? getEntitlements({
        role: context.role,
        plan: context.plan,
        recruiterTier: context.recruiterTier,
      }).recruiter.initiateMessages
    : false;
  const { notice: noticeCode, status: statusParam, sort: sortParam } = await searchParams;
  const band = await getViewerBand();
  const notice = resolveInboxNotice(noticeCode, band);

  const all = job.applications;
  const countFor = (statuses: readonly ApplicationStatus[] | null): number =>
    statuses ? all.filter((a) => statuses.includes(a.status)).length : all.length;

  const activeFilter = FILTERS.find((f) => f.key === statusParam) ?? FILTERS[0];
  const activeSort = SORTS.find((s) => s.key === sortParam) ?? SORTS[0];

  const selected = activeFilter.statuses;
  const rows = (selected ? all.filter((a) => selected.includes(a.status)) : [...all]).sort(
    (a, b) => {
      if (activeSort.key === "rate") {
        // No stated rate sorts last, then newest first inside a tie.
        const byRate = (b.proposedRateUsd ?? -1) - (a.proposedRateUsd ?? -1);
        if (byRate !== 0) return byRate;
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      const oldestFirst = a.createdAt.getTime() - b.createdAt.getTime();
      return activeSort.key === "oldest" ? oldestFirst : -oldestFirst;
    },
  );

  const basePath = `/dashboard/recruiter/jobs/${job.id}/applications`;
  // Filter and sort survive each other. The notice code is deliberately
  // dropped — an outcome message from the previous action is stale here.
  const viewHref = (next: { status?: FilterKey; sort?: SortKey }): string => {
    const status = next.status ?? activeFilter.key;
    const sort = next.sort ?? activeSort.key;
    const query = new URLSearchParams();
    if (status !== "all") query.set("status", status);
    if (sort !== "newest") query.set("sort", sort);
    const suffix = query.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  };

  // Decisions the recruiter may still make. WITHDRAWN is the applicant's and
  // is terminal for this screen.
  const decidable = new Set<ApplicationStatus>([
    "SUBMITTED",
    "VIEWED",
    "SHORTLISTED",
    "REJECTED",
  ]);

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-2">
          <Link
            href="/dashboard/recruiter"
            className="t-label -ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <IconArrowLeft className="size-4" />
            Your jobs
          </Link>
        </nav>

        <header className="mb-5 flex flex-wrap items-end justify-between gap-4 pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="t-heading">{job.title}</h1>
              <ProfileBadge spec={jobStatusBadge(job.status)} />
            </div>
            <p className="mt-1 text-[15px] text-muted-foreground">
              <span className="tabular font-medium text-foreground">{all.length}</span>{" "}
              {all.length === 1 ? "application" : "applications"} received.
            </p>
          </div>
          <Button
            variant="outline"
            render={<Link href={`/jobs/${job.slug}`}>View public post</Link>}
          />
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-5">
            {notice.message}
          </Notice>
        ) : null}

        {all.length === 0 ? (
          <>
            <h2 className="sr-only">Applications</h2>
            {job.status === "ACTIVE" ? (
              <EmptyState
                title="No applications yet"
                guidance="The post is live, so the next step is distribution: send the public link to the places your candidates already read. Most roles see their first application within 3 days of going live."
                action={
                  <Button
                    variant="outline"
                    render={<Link href={`/jobs/${job.slug}`}>View public post</Link>}
                  />
                }
              />
            ) : (
              <EmptyState
                title="No applications yet"
                guidance={offlineGuidance(job.status)}
                action={
                  <Button render={<Link href="/dashboard/recruiter">Go to your jobs</Link>} />
                }
              />
            )}
          </>
        ) : (
          <>
            {/* The shape of the pipeline before a single row is read — and the
                filter, so the counts and the list can never disagree. */}
            <section aria-labelledby="pipeline-heading" className="mb-5">
              <h2 id="pipeline-heading" className="sr-only">
                Pipeline
              </h2>
              {/* gap-px over a Line-coloured ground: exact hairlines between
                  cells at any wrap point, no doubled borders. */}
              <ul className="surface-card grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-5">
                {FILTERS.map((filter) => {
                  const count = countFor(filter.statuses);
                  const isActive = filter.key === activeFilter.key;
                  return (
                    <li key={filter.key} className="bg-card">
                      <Link
                        href={viewHref({ status: filter.key })}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "row-hover flex h-full flex-col justify-between gap-2 px-4 py-3",
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                          isActive && "bg-muted",
                        )}
                      >
                        <span className="t-label text-muted-foreground">{filter.label}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="t-data text-[22px] leading-none">{count}</span>
                          {isActive ? (
                            <span className="t-label text-muted-foreground">Showing</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="applications-heading">
              <h2 id="applications-heading" className="sr-only">
                Applications
              </h2>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6">
                <p className="t-label text-muted-foreground">
                  {activeFilter.key === "all"
                    ? `${all.length} ${all.length === 1 ? "application" : "applications"}`
                    : `${rows.length} of ${all.length} · ${activeFilter.label}`}
                </p>
                <div className="flex items-center gap-1">
                  <span id="sort-heading" className="t-label text-muted-foreground">
                    Sort
                  </span>
                  <div role="group" aria-labelledby="sort-heading" className="flex items-center">
                    {SORTS.map((sort) => {
                      const isActive = sort.key === activeSort.key;
                      return (
                        <Link
                          key={sort.key}
                          href={viewHref({ sort: sort.key })}
                          aria-current={isActive ? "true" : undefined}
                          className={cn(
                            "t-label inline-flex min-h-11 items-center px-2",
                            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                            isActive
                              ? "text-foreground underline underline-offset-4"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {sort.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  title="Nothing in this view"
                  guidance={`No application is ${activeFilter.nothingYet} yet. Switch back to all ${all.length} to see the full list.`}
                  action={
                    <Button
                      variant="outline"
                      render={<Link href={viewHref({ status: "all" })}>Show all applications</Link>}
                    />
                  }
                />
              ) : (
                <>
                  {/* Column labels for the eye only: every cell below carries
                      its own text for a screen reader, so reading these twice
                      would be noise. */}
                  <div
                    aria-hidden="true"
                    className="hidden items-center gap-x-4 border-x border-t border-border bg-muted px-4 py-2 sm:flex"
                  >
                    <span className={cn("t-label text-muted-foreground", COL.applicant)}>
                      Applicant
                    </span>
                    <span className={cn("t-label text-muted-foreground", COL.country)}>
                      Country
                    </span>
                    <span className={cn("t-label text-muted-foreground", COL.rate)}>Rate USD</span>
                    <span className={cn("t-label text-muted-foreground", COL.applied)}>
                      Applied
                    </span>
                    <span className={cn("t-label text-muted-foreground", COL.status)}>Status</span>
                    <span className={cn("t-label text-right text-muted-foreground", COL.decision)}>
                      Decision
                    </span>
                  </div>

                  <ul className="rowset">
                    {rows.map((app) => {
                      const fl = app.freelancer;
                      const country = countryName(fl.country) ?? fl.country;
                      const words = wordCount(app.coverLetter);
                      const canDecide = decidable.has(app.status);
                      const noteId = `note-${app.id}`;
                      return (
                        <li
                          key={app.id}
                          className="row-hover flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5"
                        >
                          {/* The avatar sits INSIDE the applicant column, not
                              beside it, so COL.applicant keeps its width and
                              the header strip above stays aligned to the rows.
                              Initials only: the recruiter-inbox select chain
                              (lib/db/application.ts) does not carry
                              avatarUrl — see the note in the handover. */}
                          <div className={cn("flex items-center gap-3 self-center", COL.applicant)}>
                            <Avatar name={fl.displayName} src={fl.avatarUrl} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/freelancers/${fl.slug}`}
                                  className="truncate font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                >
                                  {fl.displayName}
                                </Link>
                                <ProfileBadge spec={freelancerVerificationBadge(fl.verification)} />
                              </div>
                              <p className="mt-1 truncate text-[15px] leading-[22px] text-muted-foreground">
                                {fl.headline}
                              </p>
                              {/* Country moves inline when its column is not on
                                  screen. Only one of the two is ever rendered. */}
                              <p className="t-label mt-1 text-muted-foreground lg:hidden">
                                {country}
                              </p>
                            </div>
                          </div>

                          <span
                            className={cn(
                              "t-label self-center truncate text-muted-foreground",
                              COL.country,
                            )}
                          >
                            {country}
                          </span>

                          <span className={cn("self-center", COL.rate)}>
                            {app.proposedRateUsd ? (
                              <span className="t-data block">
                                ${app.proposedRateUsd.toLocaleString("en-US")}
                                <span className="sr-only"> proposed for this job</span>
                              </span>
                            ) : (
                              <span className="t-data block text-muted-foreground">
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">No rate proposed</span>
                              </span>
                            )}
                            {fl.hourlyRateUsd ? (
                              <span className="t-label block text-muted-foreground">
                                ${fl.hourlyRateUsd.toLocaleString("en-US")}/hr listed
                              </span>
                            ) : null}
                          </span>

                          <span
                            className={cn("t-data self-center text-muted-foreground", COL.applied)}
                            title={`Applied ${longDate.format(app.createdAt)} · ${timeAgo(app.createdAt)}`}
                          >
                            <span className="sr-only">Applied </span>
                            {shortDate.format(app.createdAt)}
                          </span>

                          <span className={cn("self-center", COL.status)}>
                            <ProfileBadge spec={applicationStatusBadge(app.status)} />
                          </span>

                          <div
                            className={cn(
                              "flex items-center justify-end gap-2 self-center",
                              COL.decision,
                            )}
                          >
                            {canDecide ? (
                              <>
                                {app.status !== "SHORTLISTED" ? (
                                  <form action={decideApplication}>
                                    <input type="hidden" name="jobId" value={job.id} />
                                    <input type="hidden" name="applicationId" value={app.id} />
                                    <input type="hidden" name="decision" value="SHORTLISTED" />
                                    <Button type="submit" size="sm" variant="secondary">
                                      Shortlist
                                      <span className="sr-only"> {fl.displayName}</span>
                                    </Button>
                                  </form>
                                ) : null}
                                {app.status !== "REJECTED" ? (
                                  <form action={decideApplication}>
                                    <input type="hidden" name="jobId" value={job.id} />
                                    <input type="hidden" name="applicationId" value={app.id} />
                                    <input type="hidden" name="decision" value="REJECTED" />
                                    <Button type="submit" size="sm" variant="outline">
                                      Reject
                                      <span className="sr-only"> {fl.displayName}</span>
                                    </Button>
                                  </form>
                                ) : null}
                              </>
                            ) : (
                              <span className="t-label text-right text-muted-foreground">
                                Withdrawn by the applicant
                              </span>
                            )}
                          </div>

                          {/* The thing that was missing entirely: a way to
                              actually talk to the person who applied. */}
                          <div className="col-span-full mt-1">
                            <StartThread
                              applicationId={app.id}
                              conversationId={threads.get(app.id)}
                              canInitiate={canInitiate}
                              counterpartyName={fl.displayName}
                              returnTo={`/dashboard/recruiter/jobs/${job.id}/applications`}
                              compact
                            />
                          </div>

                          {/* Collapsed by default so 50 rows stay scannable.
                              The length is on the label, so the recruiter can
                              decide what to open before opening it. */}
                          <div className="basis-full">
                            <details className="group">
                              <summary className={SUMMARY_CLASSES}>
                                <IconArrowRight className="size-4 transition-transform duration-[120ms] group-open:rotate-90" />
                                Cover letter · {words} {words === 1 ? "word" : "words"}
                              </summary>
                              <p className="measure mt-1 mb-2 border-l border-border pl-4 text-[15px] leading-[22px] whitespace-pre-wrap">
                                {app.coverLetter}
                              </p>
                            </details>

                            {canUseNotes ? (
                              <details className="group">
                                <summary className={SUMMARY_CLASSES}>
                                  <IconArrowRight className="size-4 transition-transform duration-[120ms] group-open:rotate-90" />
                                  Private note · {app.recruiterNote ? "saved" : "empty"}
                                </summary>
                                <form
                                  action={saveApplicationNote}
                                  className="mt-1 mb-2 flex flex-wrap items-start gap-2"
                                >
                                  <input type="hidden" name="jobId" value={job.id} />
                                  <input type="hidden" name="applicationId" value={app.id} />
                                  <label htmlFor={noteId} className="sr-only">
                                    Private note about {fl.displayName}
                                  </label>
                                  <Textarea
                                    id={noteId}
                                    name="note"
                                    defaultValue={app.recruiterNote ?? ""}
                                    rows={2}
                                    maxLength={2000}
                                    placeholder="What your team should remember about this applicant. Only your team sees it."
                                    className="min-h-16 max-w-xl flex-1"
                                  />
                                  <Button type="submit" size="sm" variant="outline">
                                    Save note
                                  </Button>
                                </form>
                              </details>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            {!canUseNotes ? (
              <p className="measure mt-4 text-[15px] leading-[22px] text-muted-foreground">
                Private notes sit on {upsellLine("RECRUITER_GROWTH", band)}: a note against each
                applicant that only your team reads, kept with the application so the next person
                to open this inbox knows where you left off. Growth also opens candidate search,
                filters and pipelines. Billing launches soon.
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
