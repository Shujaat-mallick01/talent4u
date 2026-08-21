import Link from "next/link";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/guards";
import { getModerationCounts, listOpenReports } from "@/lib/db/moderation";
import { listOpenSafetyFlags } from "@/lib/db/safety";
import { listPendingVerifications } from "@/lib/db/verification";
import { timeAgo } from "@/lib/format/time";
import { countryName } from "@/lib/geo/countries";
import { jobStatusBadge, recruiterTierBadge } from "@/lib/profile/badges";

import { signOut } from "../(auth)/actions";
import { NOTICE_CLASSES } from "../dashboard/recruiter/notices";
import {
  approveRecruiterVerification,
  banRecruiter,
  clearFlag,
  decideReport,
  rejectRecruiterVerification,
  upholdFlag,
} from "./actions";
import { resolveAdminNotice } from "./notices";

/**
 * The moderation queue. ADMIN accounts exist only via seed or manual SQL —
 * no signup path creates one — and requireRole re-checks the database on
 * every render, so this is not reachable by anyone else.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; jobs?: string }>;
}) {
  const { user } = await requireRole("ADMIN");

  const [counts, flags, reports, verifications, params] = await Promise.all([
    getModerationCounts(),
    listOpenSafetyFlags(50),
    listOpenReports(50),
    listPendingVerifications(),
    searchParams,
  ]);
  const notice = resolveAdminNotice(params.notice, params.jobs);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Moderation</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {counts.openFlags} open {counts.openFlags === 1 ? "flag" : "flags"} ·{" "}
              {counts.openReports} {counts.openReports === 1 ? "report" : "reports"} ·{" "}
              {counts.pendingVerifications} pending{" "}
              {counts.pendingVerifications === 1 ? "verification" : "verifications"} · {user.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/removed-employers">Public removals page</Link>}
            />
            <form action={signOut}>
              <Button type="submit" size="sm" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        {notice ? (
          <p
            role="status"
            className={`mb-6 rounded-[2px] border px-3 py-2 text-sm ${NOTICE_CLASSES[notice.tone]}`}
          >
            {notice.message}
          </p>
        ) : null}

        {/* Safety flags */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold">Safety flags</h2>
          {flags.length === 0 ? (
            <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
              Nothing open. Flagged posts are held before publication, so an empty queue means
              nothing is waiting on you.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {flags.map((flag) => (
                <li key={flag.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-[2px] border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-warning">
                      {flag.reason.replace(/_/g, " ")}
                    </span>
                    {flag.matchedTerm ? (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        matched “{flag.matchedTerm}”
                      </span>
                    ) : null}
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {flag.isAutomated ? "automated" : "reported"} · {timeAgo(flag.createdAt)}
                    </span>
                  </div>

                  {flag.job ? (
                    <div className="mt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* A held job's public page 404s by design, so only
                            link when the post is actually reachable. */}
                        {flag.job.status === "ACTIVE" ? (
                          <Link
                            href={`/jobs/${flag.job.slug}`}
                            className="font-medium hover:underline"
                          >
                            {flag.job.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{flag.job.title}</span>
                        )}
                        <ProfileBadge spec={jobStatusBadge(flag.job.status)} />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        <Link
                          href={`/companies/${flag.job.recruiter.slug}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {flag.job.recruiter.companyName}
                        </Link>{" "}
                        <ProfileBadge spec={recruiterTierBadge(flag.job.recruiter.tier)} />
                      </p>
                      {/* The text the decision is actually about. */}
                      <details className="mt-2">
                        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
                          Read the post
                        </summary>
                        <p className="mt-1 max-h-80 overflow-y-auto whitespace-pre-wrap border-l border-border pl-3 text-sm leading-relaxed">
                          {flag.job.description}
                          {flag.job.location ? `\n\nLocation: ${flag.job.location}` : ""}
                        </p>
                      </details>
                    </div>
                  ) : null}

                  {flag.message ? (
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground">
                        Message from {flag.message.sender.email} ({flag.message.sender.role})
                      </p>
                      <p className="mt-1 whitespace-pre-wrap border-l border-border pl-3 text-sm">
                        {flag.message.body}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={clearFlag}>
                      <input type="hidden" name="flagId" value={flag.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Clear (false positive)
                      </Button>
                    </form>
                    <form action={upholdFlag}>
                      <input type="hidden" name="flagId" value={flag.id} />
                      <Button type="submit" size="sm">
                        Uphold — remove the post
                      </Button>
                    </form>
                  </div>

                  {flag.job && !flag.job.recruiter.isBanned ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-destructive">
                        Ban this employer
                      </summary>
                      <form action={banRecruiter} className="mt-2 flex flex-wrap items-start gap-2">
                        <input type="hidden" name="recruiterId" value={flag.job.recruiter.id} />
                        <Input
                          name="reason"
                          placeholder="Public reason — shown on /removed-employers"
                          maxLength={300}
                          className="min-w-72 flex-1"
                        />
                        <Button type="submit" size="sm" variant="destructive">
                          Ban and remove all posts
                        </Button>
                      </form>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Verification queue */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold">Verification requests</h2>
          {verifications.length === 0 ? (
            <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
              No companies waiting. Check the domain, registration number, and LinkedIn page
              describe the same company before approving.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {verifications.map((v) => (
                <li key={v.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/companies/${v.slug}`} className="font-medium hover:underline">
                      {v.companyName}
                    </Link>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {countryName(v.country) ?? v.country} · submitted{" "}
                      {v.verificationSubmittedAt ? timeAgo(v.verificationSubmittedAt) : "—"}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="inline font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        Account
                      </dt>{" "}
                      <dd className="inline">{v.user.email}</dd>
                    </div>
                    <div>
                      <dt className="inline font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        Domain
                      </dt>{" "}
                      <dd className="inline">{v.companyDomain ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        Reg. no
                      </dt>{" "}
                      <dd className="inline">{v.registrationNo ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        LinkedIn
                      </dt>{" "}
                      <dd className="inline">
                        {v.linkedinUrl ? (
                          <a
                            href={v.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="underline"
                          >
                            open
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    <form action={approveRecruiterVerification}>
                      <input type="hidden" name="recruiterId" value={v.id} />
                      <Button type="submit" size="sm">
                        Approve
                      </Button>
                    </form>
                    <form action={rejectRecruiterVerification} className="flex flex-1 items-start gap-2">
                      <input type="hidden" name="recruiterId" value={v.id} />
                      <Textarea
                        name="note"
                        rows={1}
                        maxLength={1000}
                        placeholder="What they need to fix — sent back to them"
                        className="min-h-9 min-w-64 flex-1"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Return
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* User reports */}
        <section>
          <h2 className="mb-3 text-sm font-semibold">Reports</h2>
          {reports.length === 0 ? (
            <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
              No open reports.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {reports.map((report) => (
                <li key={report.id} className="p-4">
                  <p className="text-sm">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {report.targetType}
                    </span>{" "}
                    <span className="font-medium">{report.reason}</span>
                  </p>
                  {report.details ? (
                    <p className="mt-1 whitespace-pre-wrap border-l border-border pl-3 text-sm text-muted-foreground">
                      {report.details}
                    </p>
                  ) : null}
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    by {report.reportedBy.email} · {timeAgo(report.createdAt)} · target{" "}
                    {report.targetId}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <form action={decideReport}>
                      <input type="hidden" name="reportId" value={report.id} />
                      <input type="hidden" name="decision" value="CLEARED" />
                      <Button type="submit" size="sm" variant="outline">
                        Clear
                      </Button>
                    </form>
                    <form action={decideReport}>
                      <input type="hidden" name="reportId" value={report.id} />
                      <input type="hidden" name="decision" value="UPHELD" />
                      <Button type="submit" size="sm">
                        Uphold
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
