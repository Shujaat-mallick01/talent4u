import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StartThread } from "@/components/messages/start-thread";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconCheck } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { requireRole } from "@/lib/auth/guards";
import { listApplicationsForFreelancer } from "@/lib/db/application";
import { mapApplicationConversations } from "@/lib/db/message";
import { getFreelancerProfileForEdit } from "@/lib/db/profile-edit";
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
import { profileStrength } from "@/lib/services/profile-strength";

const PROFILE_EDITOR = "/dashboard/freelancer/profile";
const VERIFICATION = "/dashboard/freelancer/verification";

/**
 * Where each strength item is actually fixed, and what to call the trip there.
 * The hashes are the editor's own field ids, so "Write your bio" lands on the
 * bio box rather than at the top of a long form. A key this map has not heard
 * of falls back to the editor, so a new strength item can never produce a
 * dead action.
 */
const NEXT_ACTION: Record<string, { href: string; cta: string }> = {
  bio: { href: `${PROFILE_EDITOR}#bio`, cta: "Write your bio" },
  skills: { href: `${PROFILE_EDITOR}#skillToAdd`, cta: "Add skills" },
  "work-link": { href: `${PROFILE_EDITOR}#githubUrl`, cta: "Add a link" },
  rate: { href: `${PROFILE_EDITOR}#hourlyRateUsd`, cta: "Set your rate" },
  headline: { href: `${PROFILE_EDITOR}#headline`, cta: "Write a headline" },
  verification: { href: VERIFICATION, cta: "Send links for review" },
};

/** Ten segments of ten percent, in the quota slots' visual language. */
const SEGMENTS = 10;

function filledSegments(percent: number): number {
  if (percent <= 0) return 0;
  // A profile that has earned something never reads as an empty bar.
  return Math.max(1, Math.min(SEGMENTS, Math.round((percent / 100) * SEGMENTS)));
}

export default async function FreelancerDashboardPage() {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("FREELANCER");
  // The editor's query, reused: it carries the id and verification this page
  // already needed plus every field profile strength is computed from, so the
  // meter costs no extra round trip and cannot disagree with the editor's.
  const profile = await getFreelancerProfileForEdit(user.id);
  if (!profile) redirect("/onboarding/freelancer");

  const [applications, quota, band] = await Promise.all([
    listApplicationsForFreelancer(profile.id),
    getApplicationQuotaStatus(user.id),
    getViewerBand(),
  ]);
  // One query for every row, not one per row.
  const threads = await mapApplicationConversations(
    applications.map((a) => a.id),
    user.id,
  );

  const strength = profileStrength({
    headline: profile.headline,
    bio: profile.bio,
    hourlyRateUsd: profile.hourlyRateUsd,
    // Not selected by the editor's query, and no item scores on it today.
    // Kept null on both surfaces so the two percentages stay identical.
    avatarUrl: null,
    githubUrl: profile.githubUrl,
    portfolioUrl: profile.portfolioUrl,
    linkedinUrl: profile.linkedinUrl,
    skillCount: profile.skills.length,
    verificationSubmittedAt: profile.verificationSubmittedAt,
    verificationNote: profile.verificationNote,
  });
  const nextAction = strength.next
    ? (NEXT_ACTION[strength.next.key] ?? { href: PROFILE_EDITOR, cta: "Edit your profile" })
    : null;
  const filled = filledSegments(strength.percent);

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-border pb-4">
          <div>
            <h1 className="t-heading">Your applications</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
              <ProfileBadge spec={freelancerVerificationBadge(profile.verification)} />
              <span>{applications.length === 0 ? "Nothing sent yet" : `${applications.length} sent in total`}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            {/* Profile strength. The same countable-segments language as the
                quota slots below — the exact number is right beside it, so the
                bar is for the eye and the digits carry the claim. */}
            <div>
              <h2 className="t-label text-muted-foreground">Profile strength</h2>
              <p className="mt-1.5 flex items-center gap-3">
                <span className="t-data text-[28px] leading-none">{strength.percent}%</span>
                <span aria-hidden className="flex gap-1">
                  {Array.from({ length: SEGMENTS }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-6 w-1.5 rounded-[1px]",
                        i < filled ? "bg-primary" : "bg-border",
                      )}
                    />
                  ))}
                </span>
              </p>
            </div>

            <Button render={<Link href="/jobs">Browse jobs</Link>} />
          </div>
        </header>

        {/* One next step, never a checklist. The full list lives on the editor,
            where every item is a field you can actually fill in. */}
        {strength.next && nextAction ? (
          <section className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border border-border px-4 py-3">
            <div className="min-w-[18rem] flex-1">
              <h2 className="t-label text-muted-foreground">
                Next · worth {strength.next.weight}%
              </h2>
              <p className="mt-1 font-semibold">{strength.next.label}</p>
              <p className="measure mt-0.5 text-[15px] leading-[22px] text-muted-foreground">
                {strength.next.why}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              render={<Link href={nextAction.href}>{nextAction.cta}</Link>}
            />
          </section>
        ) : (
          <section className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border border-border px-4 py-3">
            <p className="flex items-center gap-2 text-[15px]">
              <IconCheck className="size-5 text-success" label="Done" />
              Your profile is complete — all {strength.items.length} items done.
            </p>
            <Button
              size="sm"
              variant="secondary"
              render={<Link href={`/freelancers/${profile.slug}`}>See your public page</Link>}
            />
          </section>
        )}

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
