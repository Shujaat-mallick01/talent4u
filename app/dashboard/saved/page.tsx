import Link from "next/link";
import { redirect } from "next/navigation";

import { SaveToggle } from "@/components/jobs/save-toggle";
import { ProfileBadge } from "@/components/profile/profile-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/guards";
import { listSavedJobs } from "@/lib/db/saved-job";
import { getFreelancerProfileByUserId } from "@/lib/db/users";
import { timeAgo } from "@/lib/format/time";
import { jobStatusBadge, recruiterTierBadge } from "@/lib/profile/badges";

export const metadata = { title: "Saved jobs" };

const budgetLabel = (min: number | null, max: number | null, type: string): string | null => {
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  const suffix = type === "HOURLY" ? "/hr" : "";
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}${suffix}`;
  if (min !== null) return `From ${fmt(min)}${suffix}`;
  if (max !== null) return `Up to ${fmt(max)}${suffix}`;
  return null;
};

/**
 * The saved list. A bookmark on a job that has since closed or vanished STAYS
 * here with its status visible — a silently missing bookmark reads as a bug;
 * a "Closed" pill reads as an answer.
 */
export default async function SavedJobsPage() {
  const { user } = await requireRole("FREELANCER");
  const profile = await getFreelancerProfileByUserId(user.id);
  if (!profile) redirect("/onboarding/freelancer");

  const saved = await listSavedJobs(profile.id);

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <header className="mb-6 pb-4">
          <h1 className="t-heading">Saved jobs</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {saved.length === 0
              ? "Nothing saved yet."
              : `${saved.length} ${saved.length === 1 ? "job" : "jobs"} — saving does not reserve anything, so apply while the post is open.`}
          </p>
        </header>

        {saved.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            guidance="The bookmark on any job post keeps it here — useful when you are choosing which of your 12 monthly applications to spend."
            action={<Button render={<Link href="/jobs">Browse open jobs</Link>} />}
          />
        ) : (
          <ul className="rowset">
            {saved.map(({ job, createdAt }) => {
              // Hidden posts (removed employer, deactivated company) keep the
              // row but lose the link — the page it points at 404s.
              const gone =
                job.status !== "ACTIVE" ||
                job.recruiter.isBanned ||
                job.recruiter.deactivatedAt !== null;
              const budget = budgetLabel(job.budgetMinUsd, job.budgetMaxUsd, job.engagementType);
              return (
                <li
                  key={job.id}
                  className="row-hover flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
                >
                  <Avatar
                    name={job.recruiter.companyName}
                    src={job.recruiter.logoUrl}
                    size="sm"
                    shape="company"
                  />
                  <div className="min-w-[16rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {gone ? (
                        <span className="truncate font-semibold text-muted-foreground">
                          {job.title}
                        </span>
                      ) : (
                        <Link
                          href={`/jobs/${job.slug}`}
                          className="truncate font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {job.title}
                        </Link>
                      )}
                      <ProfileBadge spec={jobStatusBadge(job.status)} />
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-[15px] text-muted-foreground">
                      {job.recruiter.companyName}
                      <ProfileBadge spec={recruiterTierBadge(job.recruiter.tier)} />
                    </p>
                  </div>

                  {budget ? <span className="t-data shrink-0">{budget}</span> : null}
                  <span className="t-label w-24 shrink-0 text-right text-muted-foreground">
                    saved {timeAgo(createdAt)}
                  </span>
                  <SaveToggle jobId={job.id} saved returnTo="/dashboard/saved" compact />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
