import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { IconCheck } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { requireRole } from "@/lib/auth/guards";
import { listSkillsGroupedByCategory } from "@/lib/db/freelancer";
import { getFreelancerProfileForEdit } from "@/lib/db/profile-edit";
import { freelancerVerificationBadge } from "@/lib/profile/badges";
import { profileStrength } from "@/lib/services/profile-strength";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

import { PhotoForm } from "@/components/profile/photo-form";

import { FreelancerProfileEditForm } from "./edit-form";
import { updateAvatar } from "./actions";
import { resolveProfileEditNotice } from "./notices";

export const metadata = { title: "Edit your profile" };

/** Ten segments of ten percent — the dashboard's bar, at row scale. */
const SEGMENTS = 10;

function filledSegments(percent: number): number {
  if (percent <= 0) return 0;
  return Math.max(1, Math.min(SEGMENTS, Math.round((percent / 100) * SEGMENTS)));
}

export default async function FreelancerProfileEditPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  // Guarded here, not just in the shell — curl hits the same wall.
  const { user } = await requireRole("FREELANCER");

  const [profile, skillGroups, params] = await Promise.all([
    getFreelancerProfileForEdit(user.id),
    listSkillsGroupedByCategory(),
    searchParams,
  ]);
  if (!profile) redirect("/onboarding/freelancer");

  const notice = resolveProfileEditNotice(params.notice);
  const publicHref = `/freelancers/${profile.slug}`;

  // Same input on both surfaces, from the same query, so the percent here can
  // never disagree with the one on the dashboard. avatarUrl is not selected by
  // this query and no item scores on it today.
  const strength = profileStrength({
    headline: profile.headline,
    bio: profile.bio,
    hourlyRateUsd: profile.hourlyRateUsd,
    avatarUrl: profile.avatarUrl,
    githubUrl: profile.githubUrl,
    portfolioUrl: profile.portfolioUrl,
    linkedinUrl: profile.linkedinUrl,
    skillCount: profile.skills.length,
    verificationSubmittedAt: profile.verificationSubmittedAt,
    verificationNote: profile.verificationNote,
  });
  const filled = filledSegments(strength.percent);

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
        <header className="mb-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-heading">Edit your profile</h1>
            <ProfileBadge spec={freelancerVerificationBadge(profile.verification)} />
          </div>
          {/* The slug is set once and never moves, so say so here rather than
              letting somebody discover it by renaming and losing their links. */}
          <p className=" mt-2 text-[15px] leading-[22px] text-muted-foreground">
            This is the page a company reads before deciding whether to reply. Its address stays{" "}
            <Link
              href={publicHref}
              className="rounded-xs font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {new URL(SITE_URL).host}
              {publicHref}
            </Link>{" "}
            whatever you change here — links people already have keep working.
          </p>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-6">
            {notice.message}
          </Notice>
        ) : null}

        {profile.deactivatedAt ? (
          <Notice tone="warning" className="mb-6">
            Your profile is hidden from search and browse right now. You can keep editing it — the
            changes are waiting for you when you put it back up.
          </Notice>
        ) : null}

        {/* The whole checklist belongs here, next to the fields that answer it.
            The dashboard names one next step; this is the list behind it, with
            what each remaining item is worth so the order is arguable rather
            than mysterious. */}
        <section className="mb-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="t-label text-muted-foreground">Profile strength</h2>
            <p className="flex items-center gap-2">
              <span aria-hidden className="flex gap-1">
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-4 w-1.5 rounded-full",
                      i < filled ? "bg-primary" : "bg-border",
                    )}
                  />
                ))}
              </span>
              <span className="t-data">{strength.percent}%</span>
            </p>
          </div>

          <ul className="rowset">
            {strength.items.map((item) => (
              <li key={item.key} className="flex items-start gap-3 px-4 py-3">
                {item.done ? (
                  <IconCheck className="mt-0.5 size-5 text-success" label="Done" />
                ) : (
                  <span
                    aria-hidden
                    className="mt-0.5 size-5 shrink-0 rounded-[5px] border border-border"
                  />
                )}
                <div className="min-w-[14rem] flex-1">
                  <p className="text-[15px] leading-[22px] font-semibold">
                    {item.done ? null : <span className="sr-only">Not done yet. </span>}
                    {item.label}
                  </p>
                  <p className=" text-[15px] leading-[22px] text-muted-foreground">
                    {item.why}
                  </p>
                </div>
                {item.done ? null : (
                  <span className="t-data shrink-0 text-muted-foreground">+{item.weight}%</span>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-2 text-[13px] leading-[19px] text-muted-foreground">
            Every item here is a field below, except the review — work links are sent to a reviewer
            from your{" "}
            <Link
              href="/dashboard/freelancer/verification"
              className="rounded-xs font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              verification page
            </Link>
            .
          </p>
        </section>

        <PhotoForm
          name={profile.displayName}
          src={profile.avatarUrl ?? null}
          shape="person"
          action={updateAvatar}
          fieldName="avatar"
          label="Profile photo"
        />

        <FreelancerProfileEditForm
          initial={{
            displayName: profile.displayName,
            headline: profile.headline,
            bio: profile.bio,
            country: profile.country,
            timezone: profile.timezone,
            hourlyRateUsd: profile.hourlyRateUsd,
            isOpenToWork: profile.isOpenToWork,
            githubUrl: profile.githubUrl,
            portfolioUrl: profile.portfolioUrl,
            linkedinUrl: profile.linkedinUrl,
            skills: profile.skills.map((s) => ({
              slug: s.skill.slug,
              name: s.skill.name,
              yearsExp: s.yearsExp,
            })),
          }}
          skillGroups={skillGroups}
        />
      </div>
    </main>
  );
}
