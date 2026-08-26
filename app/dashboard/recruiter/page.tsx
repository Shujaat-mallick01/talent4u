import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { countOccupiedSlots, listJobsForRecruiter } from "@/lib/db/job";
import { getUserPlan } from "@/lib/db/users";
import { jobStatusBadge, recruiterTierBadge } from "@/lib/profile/badges";
import { effectiveJobSlots } from "@/lib/pricing/entitlements";

import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";

import { resolveJobNotice } from "./notices";
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
  // Plan AND verification tier — the same rule publishJobForUser enforces, so
  // the number on screen is the number the server will apply.
  const cap = effectiveJobSlots(plan, current.profile.tier);
  const notice = resolveJobNotice(params);

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        {/* Identity, navigation and sign-out live in the shell now. This
            header carries only what is specific to this screen: the company's
            standing, and what they can do about it. */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 pb-4">
          <div>
            <h1 className="t-heading">Your jobs</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
              <Link
                href="/dashboard/recruiter/verification"
                className="rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ProfileBadge spec={recruiterTierBadge(current.profile.tier)} />
              </Link>
              <span>
                {PLAN_LABEL[plan] ?? "Free"} plan ·{" "}
                <span className="tabular font-medium text-foreground">{used}</span> of{" "}
                <span className="tabular font-medium text-foreground">
                  {cap === null ? "unlimited" : cap}
                </span>{" "}
                active post {cap === 1 ? "slot" : "slots"} used
              </span>
            </p>
          </div>
          <Button render={<Link href="/dashboard/recruiter/jobs/new">Post a job</Link>} />
        </header>

        {current.profile.tier === "UNVERIFIED" ? (
          <Notice tone="warning" className="mb-6">
            Your posts carry an “Unverified” label and you are capped at one at a time until we
            confirm who you are.{" "}
            <Link href="/dashboard/recruiter/verification" className="font-medium underline">
              Get verified
            </Link>{" "}
            — it takes a business email, a registration number and a LinkedIn page.
          </Notice>
        ) : null}

        {notice ? (
          <Notice tone={notice.tone} className="mb-6">
            {notice.message}
          </Notice>
        ) : null}

        <section>
          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              guidance="Post your first role to start receiving applications. It takes a title, a description and a category — you can save it as a draft and publish when you are ready."
              action={
                <Button render={<Link href="/dashboard/recruiter/jobs/new">Post a job</Link>} />
              }
            />
          ) : (
            /* Rows sharing one hairline, not cards floating with gaps. The
               applicant count is tabular and right-aligned so the column reads
               down the page. */
            <ul className="rowset">
              {jobs.map((job) => {
                const badge = jobStatusBadge(job.status);
                const canPublish = job.status === "DRAFT" || job.status === "CLOSED";
                const canClose = job.status === "ACTIVE";
                const canEdit = job.status === "DRAFT";
                const canWithdraw = job.status === "PENDING_REVIEW";
                const applications = job._count.applications;
                return (
                  <li
                    key={job.id}
                    className="row-hover flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5"
                  >
                    <div className="min-w-[16rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{job.title}</span>
                        <ProfileBadge spec={badge} />
                      </div>
                      <p className="t-label mt-1 text-muted-foreground">
                        {job.publishedAt
                          ? `Published ${dateFmt.format(job.publishedAt)}`
                          : `Created ${dateFmt.format(job.createdAt)}`}
                      </p>
                    </div>

                    <Link
                      href={`/dashboard/recruiter/jobs/${job.id}/applications`}
                      className="group flex shrink-0 items-baseline gap-1.5 rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="t-data w-8 text-right group-hover:text-primary">
                        {applications}
                      </span>
                      <span className="t-label text-muted-foreground group-hover:text-foreground">
                        {applications === 1 ? "applicant" : "applicants"}
                      </span>
                    </Link>

                    <div className="flex shrink-0 items-center gap-2">
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
