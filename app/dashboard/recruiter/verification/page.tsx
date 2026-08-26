import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/guards";
import { countDistinctConfirmedFreelancers, getVerificationStateForUser } from "@/lib/db/verification";
import { recruiterTierBadge } from "@/lib/profile/badges";
import {
  TRUSTED_ENGAGEMENT_THRESHOLD,
  verificationReadiness,
} from "@/lib/services/verification";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { NOTICE_CLASSES, type JobNotice } from "../notices";
import { saveVerificationDetails, submitVerification } from "./actions";

function resolveNotice(code: string | undefined): JobNotice | null {
  switch (code) {
    case "details_saved":
      return {
        tone: "success",
        message:
          "Company details saved. Any submission already in the queue was withdrawn so a reviewer sees the current details — submit again when you're ready.",
      };
    case "details_invalid":
      return {
        tone: "error",
        message:
          "Check the company details below: the domain must look like acme.com and the LinkedIn URL must be a linkedin.com address.",
      };
    case "submitted":
      return {
        tone: "success",
        message:
          "Submitted for review. We check the domain, registration number, and LinkedIn page against each other — usually within a couple of days.",
      };
    case "requirements_unmet":
      return {
        tone: "error",
        message: "Some requirements aren't met yet — the checklist below shows which.",
      };
    case "already_pending":
      return { tone: "warning", message: "Your submission is already in the review queue." };
    case "already_verified":
      return { tone: "warning", message: "This company is already verified." };
    default:
      return null;
  }
}

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user } = await requireRole("RECRUITER");
  const profile = await getVerificationStateForUser(user.id);
  if (!profile) redirect("/onboarding/recruiter");

  const [{ notice: noticeCode }, confirmedFreelancers] = await Promise.all([
    searchParams,
    countDistinctConfirmedFreelancers(profile.id),
  ]);
  const notice = resolveNotice(noticeCode);

  const readiness = verificationReadiness({
    accountEmail: user.email,
    accountEmailVerified: profile.user.emailVerified !== null,
    companyDomain: profile.companyDomain,
    registrationNo: profile.registrationNo,
    linkedinUrl: profile.linkedinUrl,
  });

  const pending = profile.tier === "UNVERIFIED" && profile.verificationSubmittedAt !== null;
  const trustedProgress = Math.min(confirmedFreelancers, TRUSTED_ENGAGEMENT_THRESHOLD);

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <nav className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <Link href="/dashboard/recruiter" className="hover:text-foreground">
            ← Dashboard
          </Link>
        </nav>

        <header className="mb-6 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-heading">Verification</h1>
            <ProfileBadge spec={recruiterTierBadge(profile.tier)} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Freelancers see your status on every job you post. Verified companies get a blue badge
            and full access; unverified ones are labeled as such and capped at one live post.
          </p>
        </header>

        {notice ? (
          <p
            role="status"
            className={`mb-6 rounded-lg border px-3 py-2 text-sm ${NOTICE_CLASSES[notice.tone]}`}
          >
            {notice.message}
          </p>
        ) : null}

        {profile.verificationNote ? (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="font-medium">Your last submission was returned</p>
            <p className="mt-1">{profile.verificationNote}</p>
          </div>
        ) : null}

        {/* VERIFIED checklist */}
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold">Get verified</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            All three are required. A reviewer checks that they describe the same company.
          </p>
          <ul className="rowset">
            {readiness.requirements.map((req) => (
              <li key={req.key} className="flex items-start gap-3 p-4">
                <span
                  aria-hidden
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold ${
                    req.met
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {req.met ? "✓" : ""}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {req.label}
                    <span className="sr-only">{req.met ? " — met" : " — not met"}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{req.hint}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {profile.tier === "UNVERIFIED" ? (
              pending ? (
                <p className="text-sm text-muted-foreground">
                  In the review queue since{" "}
                  {profile.verificationSubmittedAt?.toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })}
                  .
                </p>
              ) : (
                <form action={submitVerification}>
                  <Button type="submit" disabled={!readiness.ready}>
                    Submit for review
                  </Button>
                </form>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Verified{" "}
                {profile.verifiedAt?.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                .
              </p>
            )}
          </div>

          {/* The evidence itself — editable while UNVERIFIED, since these are
              optional at onboarding and a returned submission must be fixable. */}
          {profile.tier === "UNVERIFIED" ? (
            <form action={saveVerificationDetails} noValidate className="mt-6 space-y-4 border-t border-border pt-6">
              <div>
                <h3 className="text-sm font-semibold">Company details</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Signed in as <span className="font-mono text-[13px]">{user.email}</span> — the
                  domain below must match it (or a subdomain).
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="companyDomain">Company domain</Label>
                  <Input
                    id="companyDomain"
                    name="companyDomain"
                    defaultValue={profile.companyDomain ?? ""}
                    placeholder="acme.com"
                    inputMode="url"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="registrationNo">Company registration number</Label>
                  <Input
                    id="registrationNo"
                    name="registrationNo"
                    defaultValue={profile.registrationNo ?? ""}
                    placeholder="09876543"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="linkedinUrl">Company LinkedIn</Label>
                <Input
                  id="linkedinUrl"
                  name="linkedinUrl"
                  defaultValue={profile.linkedinUrl ?? ""}
                  placeholder="https://linkedin.com/company/acme"
                  inputMode="url"
                />
              </div>

              <Button type="submit" variant="outline" size="sm">
                Save company details
              </Button>
            </form>
          ) : null}
        </section>

        {/* TRUSTED progress */}
        <section className="border-t border-border pt-6">
          <h2 className="mb-1 text-sm font-semibold">Earn Trusted</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Verified companies become Trusted automatically after{" "}
            {TRUSTED_ENGAGEMENT_THRESHOLD} engagements confirmed by{" "}
            {TRUSTED_ENGAGEMENT_THRESHOLD} different freelancers. Both sides confirm — we never take
            one side&apos;s word for it.
          </p>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(trustedProgress / TRUSTED_ENGAGEMENT_THRESHOLD) * 100}%` }}
              />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {confirmedFreelancers} of {TRUSTED_ENGAGEMENT_THRESHOLD} freelancers confirmed
            </p>
          </div>
          {profile.tier === "UNVERIFIED" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Get verified first — Trusted builds on it.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
