import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StartThread } from "@/components/messages/start-thread";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { listApplicationsForFreelancer } from "@/lib/db/application";
import { mapApplicationConversations } from "@/lib/db/message";
import { timeAgo } from "@/lib/format/time";
import {
  applicationStatusBadge,
  freelancerVerificationBadge,
  jobStatusBadge,
} from "@/lib/profile/badges";
import { upsellLine } from "@/lib/pricing/catalogue";
import { APPLICATION_WINDOW_DAYS, EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";
import { getApplicationQuotaStatus } from "@/lib/services/application";
import { getViewerBand } from "@/lib/services/entitlements";


export default async function FreelancerDashboardPage() {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("FREELANCER");
  const current = await getCurrentProfile();
  if (!current || current.role !== "FREELANCER") redirect("/onboarding/freelancer");

  const [applications, quota, band] = await Promise.all([
    listApplicationsForFreelancer(current.profile.id),
    getApplicationQuotaStatus(user.id),
    getViewerBand(),
  ]);
  // One query for every row, not one per row.
  const threads = await mapApplicationConversations(
    applications.map((a) => a.id),
    user.id,
  );

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="t-heading">Your applications</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
              <ProfileBadge spec={freelancerVerificationBadge(current.profile.verification)} />
              <span>{applications.length === 0 ? "Nothing sent yet" : `${applications.length} sent in total`}</span>
            </p>
          </div>
          <Button render={<Link href="/jobs">Browse jobs</Link>} />
        </header>

        {/* The quota, as countable slots rather than a percentage bar. Twelve
            is a number you can see at a glance; 58% is not — and the thing a
            freelancer actually wants to know is how many are left. */}
        {"limit" in quota ? (
          <section className="mb-8 border border-border">
            <div className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div>
                <h2 className="t-label text-muted-foreground">
                  Applications · rolling {APPLICATION_WINDOW_DAYS} days
                </h2>
                <p className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="t-data text-[28px] leading-none">
                    {quota.limit === null ? quota.used : (quota.remaining ?? 0)}
                  </span>
                  <span className="text-[15px] text-muted-foreground">
                    {quota.limit === null
                      ? "sent · Pro, no limit"
                      : `left of ${quota.limit}`}
                  </span>
                </p>
                {quota.nextSlotFreesAt ? (
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    One more frees up on{" "}
                    <span className="tabular">
                      {quota.nextSlotFreesAt.toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    , 30 days after the application that used it.
                  </p>
                ) : null}
              </div>

              {quota.limit !== null ? (
                <div className="flex flex-col items-end gap-1.5">
                  <div
                    className="flex gap-1"
                    role="img"
                    aria-label={`${quota.used} of ${quota.limit} applications used`}
                  >
                    {Array.from({ length: quota.limit }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-6 w-1.5 rounded-[1px]",
                          i < quota.used ? "bg-primary" : "bg-border",
                        )}
                      />
                    ))}
                  </div>
                  <span className="t-label text-muted-foreground">
                    {quota.used} used
                  </span>
                </div>
              ) : null}
            </div>

            {quota.limit !== null && (quota.remaining ?? 0) <= 3 ? (
              <p className="border-t border-border bg-muted px-4 py-2.5 text-[15px]">
                {(quota.remaining ?? 0) === 0
                  ? "You are out for now. "
                  : "Running low. "}
                {upsellLine("FREELANCER_PRO", band)} lifts the limit and shows new jobs{" "}
                {EARLY_ACCESS_HOURS} hours early — billing launches soon.
              </p>
            ) : null}
          </section>
        ) : null}

        <section>
          {applications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              guidance="Browsing is free and unlimited — you only spend a slot when you actually apply. Find something worth writing a real cover letter for."
              action={
                <Button render={<Link href="/jobs">Browse open jobs</Link>} />
              }
            />
          ) : (
            <ul className="rowset">
              {applications.map((app) => (
                <li
                  key={app.id}
                  className="row-hover flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
                >
                  <div className="min-w-[16rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/jobs/${app.job.slug}`}
                        className="truncate font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {app.job.title}
                      </Link>
                      <ProfileBadge spec={applicationStatusBadge(app.status)} />
                      {app.job.status !== "ACTIVE" ? (
                        <ProfileBadge spec={jobStatusBadge(app.job.status)} />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-[15px] text-muted-foreground">
                      {app.job.recruiter.companyName}
                    </p>
                  </div>

                  {app.proposedRateUsd ? (
                    <span className="t-data shrink-0 text-right">
                      ${app.proposedRateUsd.toLocaleString("en-US")}
                    </span>
                  ) : null}
                  <span className="t-label w-24 shrink-0 text-right text-muted-foreground">
                    {timeAgo(app.createdAt)}
                  </span>

                  {/* A freelancer may always write first — the tier rule that
                      stops an unverified company opening a thread does not
                      apply in this direction, which is what lets an unverified
                      company reply at all. */}
                  <div className="w-full">
                    <StartThread
                      applicationId={app.id}
                      conversationId={threads.get(app.id)}
                      canInitiate
                      counterpartyName={app.job.recruiter.companyName}
                      returnTo="/dashboard/freelancer"
                      compact
                    />
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
