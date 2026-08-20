import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { countOccupiedSlots, listJobsForRecruiter } from "@/lib/db/job";
import { getUserPlan } from "@/lib/db/users";
import { jobStatusBadge, recruiterTierBadge } from "@/lib/profile/badges";
import { jobSlotsForPlan } from "@/lib/pricing/plans";

import { signOut } from "../../(auth)/actions";
import { NOTICE_CLASSES, resolveJobNotice } from "./notices";
import { closeExistingJob, publishExistingJob, withdrawHeldJob } from "./jobs/actions";

const PLAN_LABEL: Record<string, string> = {
  FREE: "Free",
  RECRUITER_GROWTH: "Growth",
  RECRUITER_TEAM: "Team",
  FREELANCER_PRO: "Free",
};

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function RecruiterDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; cap?: string; used?: string }>;
}) {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("RECRUITER");
  const current = await getCurrentProfile();
  if (!current || current.role !== "RECRUITER") redirect("/onboarding/recruiter");

  const [jobs, plan, used, params] = await Promise.all([
    listJobsForRecruiter(current.profile.id),
    getUserPlan(user.id),
    countOccupiedSlots(current.profile.id),
    searchParams,
  ]);
  const cap = jobSlotsForPlan(plan);
  const notice = resolveJobNotice(params);

  const noticeClasses = notice ? NOTICE_CLASSES[notice.tone] : "";

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{current.profile.companyName}</h1>
              <Link href="/dashboard/recruiter/verification" title="Verification status">
                <ProfileBadge spec={recruiterTierBadge(current.profile.tier)} />
              </Link>
              {current.profile.tier === "UNVERIFIED" ? (
                <Link
                  href="/dashboard/recruiter/verification"
                  className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary hover:underline"
                >
                  Get verified →
                </Link>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {PLAN_LABEL[plan] ?? "Free"} plan · {used} of {cap === null ? "unlimited" : cap} active
              post {cap === 1 ? "slot" : "slots"} used · signed in as {user.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button render={<Link href="/dashboard/recruiter/jobs/new">Post a job</Link>} />
            <form action={signOut}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        {notice ? (
          <p role="status" className={`mb-6 rounded-[2px] border px-3 py-2 text-sm ${noticeClasses}`}>
            {notice.message}
          </p>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold">Your jobs</h2>
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No jobs yet. Post your first job to start receiving applications.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {jobs.map((job) => {
                const badge = jobStatusBadge(job.status);
                const canPublish = job.status === "DRAFT" || job.status === "CLOSED";
                const canClose = job.status === "ACTIVE";
                const canEdit = job.status === "DRAFT";
                const canWithdraw = job.status === "PENDING_REVIEW";
                return (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{job.title}</span>
                        <ProfileBadge spec={badge} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {job.publishedAt
                          ? `Published ${dateFmt.format(job.publishedAt)}`
                          : `Created ${dateFmt.format(job.createdAt)}`}
                        {" · "}
                        <Link
                          href={`/dashboard/recruiter/jobs/${job.id}/applications`}
                          className="underline hover:text-foreground"
                        >
                          {job._count.applications}{" "}
                          {job._count.applications === 1 ? "application" : "applications"}
                        </Link>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          render={<Link href={`/dashboard/recruiter/jobs/${job.id}/edit`}>Edit</Link>}
                        />
                      ) : null}
                      {canPublish ? (
                        <form action={publishExistingJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <Button type="submit" size="sm">
                            {job.status === "CLOSED" ? "Reopen" : "Publish"}
                          </Button>
                        </form>
                      ) : null}
                      {canClose ? (
                        <form action={closeExistingJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Close
                          </Button>
                        </form>
                      ) : null}
                      {canWithdraw ? (
                        <form action={withdrawHeldJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Withdraw to draft
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
