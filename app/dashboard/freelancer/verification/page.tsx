import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconArrowLeft, IconCheck, IconExternal } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { requireRole } from "@/lib/auth/guards";
import { getFreelancerVerificationStateForUser } from "@/lib/db/freelancer-verification";
import type { FreelancerVerification } from "@/lib/generated/prisma/enums";
import { freelancerVerificationBadge } from "@/lib/profile/badges";
import {
  canSubmitWorkVerification,
  freelancerVerificationStage,
  workLinkReadiness,
  type FreelancerVerificationStage,
} from "@/lib/services/freelancer-verification";
import { isApprovalMarker } from "@/lib/validations/freelancer-verification";

import { sendWorkLinksForReview } from "./actions";
import { resolveFreelancerVerificationNotice } from "./notices";

/**
 * The freelancer's verification page.
 *
 * The hard part of this screen is not the form, it is telling the truth. Only
 * half of CLAUDE.md's rule — "government ID + at least one linked proof of
 * work" — can be checked this sprint: there is no ID provider yet. Both badge
 * levels claim an ID check, so a reviewed set of links earns no badge, and the
 * page says that in the place a reader would otherwise assume otherwise, not
 * in a footnote.
 */

const PROFILE_EDITOR = "/dashboard/freelancer/profile";

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** The three levels, in order, as the page explains them. */
const LEVELS: { value: FreelancerVerification; requirement: string }[] = [
  {
    value: "NONE",
    requirement: "A confirmed email address. Where every account starts.",
  },
  {
    value: "ID_VERIFIED",
    requirement:
      "A government ID check through an identity provider. Not live yet — we will tell you when it opens.",
  },
  {
    value: "ID_AND_WORK_VERIFIED",
    requirement:
      "That ID check, plus at least one link to work you have done that a reviewer has opened and confirmed.",
  },
];

function stageCopy(
  stage: FreelancerVerificationStage,
  args: { linkCount: number; submittedAt: Date | null; verifiedAt: Date | null; badgeTitle: string },
): { title: string; body: string } {
  switch (stage) {
    case "NO_LINKS":
      return {
        title: "Nothing to review yet",
        body: "Verification starts with one link to work you have done — GitHub, a portfolio or Behance page, or LinkedIn. Add one to your profile and you can send it from here.",
      };
    case "READY":
      return {
        title: "Ready to send",
        body: `You have ${args.linkCount} ${args.linkCount === 1 ? "link" : "links"} on your profile. A reviewer opens each one and checks it is yours and the work is real.`,
      };
    case "RETURNED":
      return {
        title: "Returned for a fix",
        body: "A reviewer sent your last submission back, with the reason above. Change what they asked for on your profile, then send it again.",
      };
    case "PENDING":
      return {
        title: "In the review queue",
        body: `Sent ${args.submittedAt ? dateFmt.format(args.submittedAt) : "recently"}. A person opens each link by hand, usually within a couple of days. Nothing to do on your side.`,
      };
    case "WORK_REVIEWED":
      return {
        title: "Work links reviewed — ID verification coming soon",
        body: "A reviewer confirmed your links are yours and the work behind them is real. Your badge does not change yet: both levels we can show claim a government ID check, and that check is not live. When it opens, your links are already done — only the ID step will be left.",
      };
    case "ID_VERIFIED":
    default:
      return {
        title: args.verifiedAt ? `Verified ${dateFmt.format(args.verifiedAt)}` : "Verified",
        body: args.badgeTitle,
      };
  }
}

export default async function FreelancerVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  // Guarded here, not just in the shell — curl hits the same wall.
  const { user } = await requireRole("FREELANCER");
  const profile = await getFreelancerVerificationStateForUser(user.id);
  if (!profile) redirect("/onboarding/freelancer");

  const { notice: noticeCode } = await searchParams;
  const notice = resolveFreelancerVerificationNotice(noticeCode);

  const readiness = workLinkReadiness(profile);
  const stage = freelancerVerificationStage(profile);
  const badge = freelancerVerificationBadge(profile.verification);
  const copy = stageCopy(stage, {
    linkCount: readiness.count,
    submittedAt: profile.verificationSubmittedAt,
    verifiedAt: profile.verifiedAt,
    badgeTitle: badge.title,
  });

  // A note is either a reviewer's reason or the marker an approval writes.
  // Only the reason is shown as one.
  const returnedNote =
    profile.verificationNote && !isApprovalMarker(profile.verificationNote)
      ? profile.verificationNote
      : null;
  // The service refuses a deactivated profile; the page withholds the button
  // rather than offering one that can only fail, and says which switch to flip.
  const canSubmit = canSubmitWorkVerification(stage) && profile.deactivatedAt === null;

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
        <nav className="mb-4">
          <Link
            href="/dashboard/freelancer"
            className="t-label inline-flex items-center gap-1.5 rounded-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <IconArrowLeft className="size-3.5" />
            Your applications
          </Link>
        </nav>

        <header className="mb-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-heading">Verification</h1>
            <ProfileBadge spec={badge} />
          </div>
          <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
            Recruiters see this next to your name on your public profile and on every application
            you send. It has two halves: a government ID check, and at least one link to work you
            have actually done.
          </p>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-6">
            {notice.message}
          </Notice>
        ) : null}

        {returnedNote ? (
          <Notice tone="warning" className="mb-6">
            <span className="font-semibold">A reviewer returned your last submission.</span>{" "}
            {returnedNote}
          </Notice>
        ) : null}

        {/* Where you stand. One block, one sentence of what happens next. */}
        <section className="surface-card mb-8 p-5">
          <h2 className="t-label text-muted-foreground">Status</h2>
          <p className="t-subhead mt-1.5">{copy.title}</p>
          <p className="measure mt-1 text-[15px] leading-[22px] text-muted-foreground">
            {copy.body}
          </p>
        </section>

        {/* What is being reviewed. */}
        <section className="mb-8">
          <h2 className="t-subhead mb-1">Your work links</h2>
          <p className="measure mb-3 text-[15px] leading-[22px] text-muted-foreground">
            One is enough. More gives a reviewer more to go on, and gives a recruiter more reason to
            read past your headline.
          </p>

          {readiness.ready ? (
            <>
              <ul className="rowset">
                {readiness.links.map((link) => (
                  <li key={link.key} className="row-hover flex items-start gap-3 px-4 py-3.5">
                    <span
                      aria-hidden
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border ${
                        link.met
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {link.met ? <IconCheck className="size-3.5" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">
                        {link.label}
                        <span className="sr-only">{link.met ? " — linked" : " — not linked"}</span>
                      </p>
                      {link.met && link.url ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-xs text-[15px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="truncate">{link.url}</span>
                          <IconExternal className="size-3.5 shrink-0" />
                        </a>
                      ) : (
                        <p className="mt-0.5 text-[15px] leading-[22px] text-muted-foreground">
                          {link.hint}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {profile.deactivatedAt !== null ? (
                  <p className="measure text-[15px] leading-[22px] text-muted-foreground">
                    Your profile is deactivated, and a review needs a live page to point at.{" "}
                    <Link
                      href="/dashboard/settings"
                      className="rounded-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Reactivate it in settings
                    </Link>{" "}
                    and come back.
                  </p>
                ) : null}
                {canSubmit ? (
                  <form action={sendWorkLinksForReview}>
                    <Button type="submit">Send for review</Button>
                  </form>
                ) : null}
                <Button
                  variant="outline"
                  size={canSubmit ? "sm" : "default"}
                  render={<Link href={PROFILE_EDITOR}>Edit your links</Link>}
                />
              </div>
            </>
          ) : (
            <EmptyState
              title="No work links on your profile"
              guidance="Add a GitHub profile, a portfolio or Behance page, or a LinkedIn profile in your profile editor. One is enough to send for review."
              action={<Button render={<Link href={PROFILE_EDITOR}>Add a work link</Link>} />}
            />
          )}
        </section>

        {/* What each level requires, and the one thing a reader would
            otherwise assume wrongly. */}
        <section className="border-t border-border pt-6">
          <h2 className="t-subhead mb-3">What each level requires</h2>
          <ul className="rowset">
            {LEVELS.map((level) => {
              const spec = freelancerVerificationBadge(level.value);
              const current = profile.verification === level.value;
              return (
                <li key={level.value} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3.5">
                  <div className="flex min-w-40 shrink-0 items-center gap-2">
                    <ProfileBadge spec={spec} />
                    {current ? <span className="t-label text-foreground">You are here</span> : null}
                  </div>
                  <p className="measure min-w-[16rem] flex-1 text-[15px] leading-[22px] text-muted-foreground">
                    {level.requirement}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="measure mt-4 text-[15px] leading-[22px] text-muted-foreground">
            ID verification is not live yet, so the badge on your profile stays{" "}
            <span className="font-medium text-foreground">Not verified</span> for now — including
            after a reviewer has confirmed your links. Both levels above say a government ID was
            checked, and yours has not been. We would rather show you nothing than a badge that
            claims a check we never ran.
          </p>
        </section>
      </div>
    </main>
  );
}
