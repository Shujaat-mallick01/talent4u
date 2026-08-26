import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requireRole } from "@/lib/auth/guards";
import { getRecruiterProfileForEdit } from "@/lib/db/profile-edit";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { SITE_URL } from "@/lib/site-url";
import { canEditVerificationEvidence } from "@/lib/services/profile-edit";
import { VERIFICATION_PAGE } from "@/lib/validations/profile-edit";

import { PhotoForm } from "@/components/profile/photo-form";

import { updateLogo } from "./actions";
import { CompanyProfileEditForm } from "./edit-form";
import { resolveCompanyEditNotice } from "./notices";

export const metadata = { title: "Company details" };

export default async function CompanyDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  // Guarded here, not just in the shell — curl hits the same wall.
  const { user } = await requireRole("RECRUITER");

  const [profile, params] = await Promise.all([
    getRecruiterProfileForEdit(user.id),
    searchParams,
  ]);
  if (!profile) redirect("/onboarding/recruiter");

  const notice = resolveCompanyEditNotice(params.notice);
  const publicHref = `/companies/${profile.slug}`;
  const evidenceEditable = canEditVerificationEvidence(profile.tier);

  const evidence = [
    { label: "Company domain", value: profile.companyDomain },
    { label: "Registration number", value: profile.registrationNo },
    { label: "Company LinkedIn", value: profile.linkedinUrl },
  ];

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
        <header className="mb-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-heading">Company details</h1>
            <ProfileBadge spec={recruiterTierBadge(profile.tier)} />
          </div>
          {/* The slug is set once and never moves, so say so here rather than
              letting somebody discover it by renaming and losing their links. */}
          <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
            Freelancers read this before applying. Its address stays{" "}
            <Link
              href={publicHref}
              className="rounded-xs font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {new URL(SITE_URL).host}
              {publicHref}
            </Link>{" "}
            whatever you rename the company to — links on old job posts keep working.
          </p>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-6">
            {notice.message}
          </Notice>
        ) : null}

        {profile.isBanned ? (
          /* A removed employer keeps their page as a matter of record. The
             server refuses the write either way; hiding the form just stops
             somebody filling it in for nothing. */
          <Notice tone="error">
            This account was removed from Talent4u, so its company page is now part of the public
            record and cannot be edited.{" "}
            <Link href="/removed-employers" className="font-medium underline">
              Read the removed employers policy
            </Link>{" "}
            to see what was published and why.
          </Notice>
        ) : (
          <>
            {profile.deactivatedAt ? (
              <Notice tone="warning" className="mb-6">
                Your company page is hidden from search and browse right now. You can keep editing
                it — the changes are waiting for you when you put it back up.
              </Notice>
            ) : null}

            <PhotoForm
              name={profile.companyName}
              src={profile.logoUrl ?? null}
              shape="company"
              action={updateLogo}
              fieldName="logo"
              label="Company logo"
            />

            <CompanyProfileEditForm
              initial={{
                companyName: profile.companyName,
                websiteUrl: profile.websiteUrl,
                description: profile.description,
                country: profile.country,
              }}
            />

            {/* The three facts a tier is decided on. Read-only here at every
                tier: while UNVERIFIED they belong to the verification flow,
                which pulls a pending submission back out of the queue when they
                change; once approved they are frozen, because a badge whose
                evidence can be swapped afterwards certifies nothing. */}
            <section className="mt-10 border-t border-border pt-8">
              <h2 className="t-subhead">Verification evidence</h2>
              <p className="measure mt-1.5 text-[15px] leading-[22px] text-muted-foreground">
                {evidenceEditable
                  ? "These three are checked against each other when you submit for review. Edit them on the verification page — changing them there takes any pending submission back out of the queue, so a reviewer never judges details you have since replaced."
                  : "Your badge was granted on these three, so they stay exactly as they were reviewed. Changing them means being reviewed again."}
              </p>

              <ul className="rowset mt-4">
                {evidence.map((row) => (
                  <li
                    key={row.label}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <span className="t-label text-muted-foreground">{row.label}</span>
                    {row.value ? (
                      <span className="t-data min-w-0 truncate">{row.value}</span>
                    ) : (
                      <span className="text-[15px] text-muted-foreground">Not set</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link href={VERIFICATION_PAGE}>
                      {evidenceEditable ? "Edit on the verification page" : "See your verification"}
                    </Link>
                  }
                />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
