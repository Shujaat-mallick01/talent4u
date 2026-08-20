import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { timeAgo } from "@/lib/format/time";
import { countryName } from "@/lib/geo/countries";
import {
  applicationStatusBadge,
  freelancerVerificationBadge,
  jobStatusBadge,
} from "@/lib/profile/badges";
import { getJobInboxForUser } from "@/lib/services/application";

import { resolveInboxNotice } from "../../../notices";
import { decideApplication, saveApplicationNote } from "../../actions";

/**
 * The application inbox for one owned job. Opening it marks SUBMITTED
 * applications VIEWED (service-side, idempotent). Recruiter notes are
 * Growth+ — the gate lives in the service; hiding the field here is
 * cosmetic per CLAUDE.md.
 */
export default async function JobApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user } = await requireRole("RECRUITER");
  const current = await getCurrentProfile();
  if (!current || current.role !== "RECRUITER") redirect("/onboarding/recruiter");

  const { id } = await params;
  const inbox = await getJobInboxForUser(user.id, id);
  if (!inbox.ok) {
    if (inbox.reason === "not-found") notFound();
    redirect("/dashboard/recruiter");
  }

  const { job, canUseNotes } = inbox;
  const { notice: noticeCode } = await searchParams;
  const notice = resolveInboxNotice(noticeCode);

  const decidable = new Set(["SUBMITTED", "VIEWED", "SHORTLISTED", "REJECTED"]);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <nav className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <Link href="/dashboard/recruiter" className="hover:text-foreground">
            ← Dashboard
          </Link>
        </nav>

        <header className="mb-6 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
            <ProfileBadge spec={jobStatusBadge(job.status)} />
          </div>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {job.applications.length}{" "}
            {job.applications.length === 1 ? "application" : "applications"}
            {" · "}
            <Link href={`/jobs/${job.slug}`} className="hover:text-foreground">
              view public post
            </Link>
          </p>
        </header>

        {notice ? (
          <p
            role="status"
            className={`mb-6 rounded-[2px] border px-3 py-2 text-sm ${
              notice.tone === "success"
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {notice.message}
          </p>
        ) : null}

        {job.applications.length === 0 ? (
          <div className="border border-dashed border-border p-10">
            <p className="text-sm text-muted-foreground">
              No applications yet. Freelancers browsing{" "}
              <Link href={`/jobs/${job.slug}`} className="underline hover:text-foreground">
                your public post
              </Link>{" "}
              will land here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {job.applications.map((app) => {
              const fl = app.freelancer;
              return (
                <li key={app.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/freelancers/${fl.slug}`}
                          className="font-semibold hover:underline"
                        >
                          {fl.displayName}
                        </Link>
                        <ProfileBadge spec={freelancerVerificationBadge(fl.verification)} />
                        <ProfileBadge spec={applicationStatusBadge(app.status)} />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{fl.headline}</p>
                      <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {countryName(fl.country) ?? fl.country}
                        {fl.hourlyRateUsd ? ` · profile rate $${fl.hourlyRateUsd}/hr` : ""}
                        {app.proposedRateUsd ? ` · proposed $${app.proposedRateUsd}` : ""}
                        {` · applied ${timeAgo(app.createdAt)}`}
                      </p>
                    </div>

                    {decidable.has(app.status) ? (
                      <div className="flex items-center gap-2">
                        {app.status !== "SHORTLISTED" ? (
                          <form action={decideApplication}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <input type="hidden" name="applicationId" value={app.id} />
                            <input type="hidden" name="decision" value="SHORTLISTED" />
                            <Button type="submit" size="sm">
                              Shortlist
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
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Withdrawn by the applicant.</p>
                    )}
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
                      Cover letter
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap border-l border-border pl-4 text-sm leading-relaxed">
                      {app.coverLetter}
                    </p>
                  </details>

                  {canUseNotes ? (
                    <form action={saveApplicationNote} className="mt-3">
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="applicationId" value={app.id} />
                      <label className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        Private note
                      </label>
                      <div className="mt-1 flex items-start gap-2">
                        <Textarea
                          name="note"
                          defaultValue={app.recruiterNote ?? ""}
                          rows={2}
                          placeholder="Only your team sees this."
                          className="min-h-16"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Save
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Private notes are on Growth ($79/mo) — billing launches soon
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
