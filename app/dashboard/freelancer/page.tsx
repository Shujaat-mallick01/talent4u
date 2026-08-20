import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { listApplicationsForFreelancer } from "@/lib/db/application";
import { timeAgo } from "@/lib/format/time";
import {
  applicationStatusBadge,
  freelancerVerificationBadge,
  jobStatusBadge,
} from "@/lib/profile/badges";
import { getApplicationQuotaStatus } from "@/lib/services/application";

import { signOut } from "../../(auth)/actions";

export default async function FreelancerDashboardPage() {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("FREELANCER");
  const current = await getCurrentProfile();
  if (!current || current.role !== "FREELANCER") redirect("/onboarding/freelancer");

  const [applications, quota] = await Promise.all([
    listApplicationsForFreelancer(current.profile.id),
    getApplicationQuotaStatus(user.id),
  ]);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {current.profile.displayName}
              </h1>
              <ProfileBadge spec={freelancerVerificationBadge(current.profile.verification)} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {user.email} ·{" "}
              <Link
                href={`/freelancers/${current.profile.slug}`}
                className="underline hover:text-foreground"
              >
                view your public profile
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button render={<Link href="/jobs">Browse jobs</Link>} />
            <form action={signOut}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        {/* Quota card */}
        {"limit" in quota ? (
          <section className="mb-8 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Applications — last 30 days</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {quota.limit === null
                    ? `${quota.used} sent · Pro — unlimited`
                    : `${quota.used} of ${quota.limit} used · ${quota.remaining} left in your rolling 30-day window`}
                  {quota.nextSlotFreesAt
                    ? ` · next slot frees ${quota.nextSlotFreesAt.toLocaleDateString("en", { month: "short", day: "numeric" })}`
                    : ""}
                </p>
              </div>
              {quota.limit !== null && (quota.remaining ?? 0) <= 3 ? (
                <p className="rounded-[2px] border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                  Running low — Pro removes the limit ($6/mo, billing launches soon)
                </p>
              ) : null}
            </div>
            {quota.limit !== null ? (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Applications */}
        <section>
          <h2 className="mb-3 text-sm font-semibold">Your applications</h2>
          {applications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nothing yet.{" "}
                <Link href="/jobs" className="underline hover:text-foreground">
                  Browse open jobs
                </Link>{" "}
                and send your first application.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {applications.map((app) => (
                <li key={app.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/jobs/${app.job.slug}`}
                        className="truncate font-medium hover:underline"
                      >
                        {app.job.title}
                      </Link>
                      <ProfileBadge spec={applicationStatusBadge(app.status)} />
                      {app.job.status !== "ACTIVE" ? (
                        <ProfileBadge spec={jobStatusBadge(app.job.status)} />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {app.job.recruiter.companyName} · applied {timeAgo(app.createdAt)}
                      {app.proposedRateUsd ? ` · proposed $${app.proposedRateUsd}` : ""}
                    </p>
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
