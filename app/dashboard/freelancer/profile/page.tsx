import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Notice } from "@/components/ui/notice";
import { requireRole } from "@/lib/auth/guards";
import { listSkillsGroupedByCategory } from "@/lib/db/freelancer";
import { getFreelancerProfileForEdit } from "@/lib/db/profile-edit";
import { freelancerVerificationBadge } from "@/lib/profile/badges";
import { SITE_URL } from "@/lib/site-url";

import { FreelancerProfileEditForm } from "./edit-form";
import { resolveProfileEditNotice } from "./notices";

export const metadata = { title: "Edit your profile" };

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

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
        <header className="mb-6 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-heading">Edit your profile</h1>
            <ProfileBadge spec={freelancerVerificationBadge(profile.verification)} />
          </div>
          {/* The slug is set once and never moves, so say so here rather than
              letting somebody discover it by renaming and losing their links. */}
          <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
            This is the page a company reads before deciding whether to reply. Its address stays{" "}
            <Link
              href={publicHref}
              className="rounded-[2px] font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
