import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceRow } from "@/components/ui/choice";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { requireUser } from "@/lib/auth/guards";
import { COUNTRIES } from "@/lib/geo/countries";
import { getSettingsViewForUser } from "@/lib/services/settings";

import {
  changeAccountPassword,
  saveBillingCountry,
  deleteAccount,
  saveJobDigest,
  saveProfileVisibility,
} from "./actions";
import { resolveSettingsNotice } from "./notices";

export const metadata = { title: "Settings" };

const NEW_PASSWORD_HINT = "At least 8 characters.";
const COUNTRY_HINT = "Where you are billed from, not necessarily where you work.";

/**
 * Account settings, shared by both roles.
 *
 * Guarded here and not only in the proxy — curl hits the same wall. Every
 * control on this page posts to a Server Action that re-resolves the account
 * from the session cookie, so nothing rendered here is load-bearing: hiding a
 * banned recruiter's reactivate button is a courtesy, and the service refuses
 * the request either way.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user } = await requireUser();
  const [result, params] = await Promise.all([getSettingsViewForUser(user.id), searchParams]);

  // No profile means onboarding is unfinished, or the account is an admin —
  // who has no public page and so has nothing on this screen. /dashboard
  // routes each of those to where they actually belong.
  if (!result.ok) redirect("/dashboard");

  const view = result.view;
  const notice = resolveSettingsNotice(params.notice);
  const isRecruiter = view.role === "RECRUITER";
  const publicNoun = isRecruiter ? "company page" : "profile";

  return (
    <main id="main" className="flex-1">
      <div className="w-full max-w-3xl px-6 py-8 lg:px-8">
        <header className="mb-6 pb-4">
          <h1 className="t-heading">Settings</h1>
          <p className=" mt-2 text-[15px] leading-[22px] text-muted-foreground">
            Your sign-in details, the country your price is set from, and whether your public page
            is visible.
          </p>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-8">
            {notice.message}
          </Notice>
        ) : null}

        {/* ── Account ─────────────────────────────────────────────────── */}
        <section aria-labelledby="account-heading">
          <h2 id="account-heading" className="t-subhead">
            Account
          </h2>

          <ul className="rowset mt-4">
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5">
              <span className="t-label text-muted-foreground">Email</span>
              <span className="min-w-0 truncate text-[15px] font-medium">{view.email}</span>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5">
              <span className="t-label text-muted-foreground">Email confirmed</span>
              <span className="text-[15px] font-medium">{view.emailVerified ? "Yes" : "No"}</span>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5">
              <span className="t-label text-muted-foreground">Account type</span>
              <span className="text-[15px] font-medium">
                {isRecruiter ? "Company" : "Freelancer"}
              </span>
            </li>
          </ul>

          <p className=" mt-3 text-[13px] leading-[18px] text-muted-foreground">
            Changing your email is not available yet: a new address has to be confirmed before we
            move your sign-in to it, and that flow is still to be built. Your email is also what a
            company-domain verification is checked against, so it is not a cosmetic field.
          </p>

          <form action={changeAccountPassword} className="mt-6">
            <h3 className="text-[15px] font-semibold">Change password</h3>
            <p className=" mt-1 text-[13px] leading-[18px] text-muted-foreground">
              We do not ask for your current one — you are signed in, and that is the proof. If you
              are not the account holder, sign out instead.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="New password" htmlFor="password" hint={NEW_PASSWORD_HINT} required>
                <Input
                  {...fieldControlProps("password", { hint: NEW_PASSWORD_HINT })}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
              <Field label="Repeat new password" htmlFor="confirm" required>
                <Input
                  {...fieldControlProps("confirm", {})}
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
            </div>

            <Button type="submit" variant="secondary" className="mt-4">
              Change password
            </Button>
          </form>
        </section>

        {/* ── Billing country ─────────────────────────────────────────── */}
        <section aria-labelledby="billing-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="billing-heading" className="t-subhead">
            Billing country
          </h2>
          <p className=" mt-2 text-[15px] leading-[22px] text-muted-foreground">
            This sets which regional price you get. Prices are lower in countries where they need to
            be, and the same features come with every band — nothing is held back. We check this
            country again at checkout, so it has to be the one you actually bill from.
          </p>

          <form action={saveBillingCountry} className="mt-4 max-w-sm">
            <Field label="Country" htmlFor="country" hint={COUNTRY_HINT} required>
              <Select
                {...fieldControlProps("country", { hint: COUNTRY_HINT })}
                name="country"
                required
                defaultValue={view.billingCountry ?? ""}
              >
                <option value="" disabled>
                  Select a country
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Button type="submit" variant="secondary" className="mt-4">
              Save country
            </Button>
          </form>

          <p className=" mt-4 text-[13px] leading-[18px] text-muted-foreground">
            {view.billingCountry
              ? `${view.billingCountryName ?? view.billingCountry} is in the ${view.bandLabel} band: ${view.paidPlanName} is ${view.paidPlanMonthly}`
              : `No country set, so you are on the ${view.bandLabel} band: ${view.paidPlanName} is ${view.paidPlanMonthly}`}
            {view.paidPlanIsReduced ? ` instead of ${view.paidPlanListMonthly}` : ""}.{" "}
            <Link
              href="/pricing"
              className="rounded-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              See every plan
            </Link>
            .
          </p>
        </section>

        {/* ── Email ───────────────────────────────────────────────────── */}
        {/* Freelancers only: it is a digest of jobs. Everything else the
            product mails is transactional and has no switch, because it is
            always about something the recipient did or that happened to them
            — see lib/email/notifications.ts. */}
        {view.role === "FREELANCER" ? (
          <section aria-labelledby="email-heading" className="mt-10 border-t border-border pt-8">
            <h2 id="email-heading" className="t-subhead">
              Email
            </h2>
            <p className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
              One email a week listing new jobs that match the skills on your profile. It is the
              only mail we send that you did not set off yourself.
            </p>

            <form action={saveJobDigest} className="surface-card mt-5 max-w-2xl p-5">
              <ChoiceRow>
                <Checkbox name="optIn" value="on" defaultChecked={view.jobDigestOptIn} />
                Send me the weekly job digest
              </ChoiceRow>
              <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
                Turning this off changes nothing else. You still hear about your own applications,
                messages and account — those are about something you did, and they have no
                unsubscribe link because they need none.
              </p>
              <Button type="submit" size="sm" variant="secondary" className="mt-4">
                Save email preference
              </Button>
            </form>
          </section>
        ) : null}

        {/* ── Public profile visibility ───────────────────────────────── */}
        <section aria-labelledby="visibility-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="visibility-heading" className="t-subhead">
            Public {publicNoun}
          </h2>
          <p className=" mt-2 text-[15px] leading-[22px] text-muted-foreground">
            {view.profile.deactivated ? (
              <>
                Your {publicNoun} is currently down. Nobody can open it and search engines are
                dropping it.
              </>
            ) : (
              <>
                Your {publicNoun} is live at{" "}
                <Link
                  href={view.profile.publicPath}
                  className="rounded-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {view.profile.publicPath}
                </Link>
                .
              </>
            )}
          </p>

          <div className="mt-4">
            <p className="t-label text-muted-foreground">What deactivating does</p>
            <ul className=" mt-2 list-disc space-y-1 pl-5 text-[15px] leading-[22px]">
              <li>Your public page returns a 404 and leaves search indexes on the next crawl.</li>
              <li>Your name stops linking anywhere it appears.</li>
              <li>
                Applications, engagements, message threads and reviews stay exactly as they are.
                Shared history is not erased — other people are part of it.
              </li>
              <li>
                You keep using Talent4u normally.{" "}
                {isRecruiter
                  ? "You can still receive applications and reply to them."
                  : "You can still browse jobs and apply for them."}
              </li>
              <li>You can put the page back up from here at any time.</li>
            </ul>
          </div>

          {isRecruiter ? (
            <p className=" mt-4 text-[13px] leading-[18px] text-muted-foreground">
              Your job posts hide with the page. You currently have{" "}
              <span className="tabular font-medium text-foreground">{view.activeJobCount}</span>{" "}
              active {view.activeJobCount === 1 ? "post" : "posts"}; while deactivated{" "}
              {view.activeJobCount === 1 ? "it disappears" : "they disappear"} from browse and{" "}
              {view.activeJobCount === 1 ? "its page 404s" : "their pages 404"}, and{" "}
              {view.activeJobCount === 1 ? "it comes" : "they come"} back when you reactivate.
              People who already applied keep their application history either way.{" "}
              <Link
                href="/dashboard/recruiter"
                className="rounded-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Close them on your jobs list
              </Link>
              .
            </p>
          ) : null}

          {view.isBanned ? (
            <Notice tone="error" className="mt-4">
              A moderator removed this company from Talent4u, so the page cannot be put back from
              here.{" "}
              <Link
                href="/removed-employers"
                className="rounded-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Read the removed employers policy
              </Link>
              .
            </Notice>
          ) : (
            <form action={saveProfileVisibility} className="mt-5">
              <input
                type="hidden"
                name="action"
                value={view.profile.deactivated ? "reactivate" : "deactivate"}
              />
              <Button
                type="submit"
                variant={view.profile.deactivated ? "secondary" : "outline"}
              >
                {view.profile.deactivated
                  ? `Reactivate public ${publicNoun}`
                  : `Deactivate public ${publicNoun}`}
              </Button>
            </form>
          )}
        </section>

        {/* ── Danger zone ─────────────────────────────────────────────── */}
        <section aria-labelledby="danger-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="danger-heading" className="t-subhead">
            Delete account
          </h2>
          <p className=" mt-2 text-[15px] leading-[22px] text-muted-foreground">
            Deleting an account is not self-service yet, and we would rather say that than hide the
            section. It removes records other people are part of — applications they read,
            engagements they confirmed, reviews they wrote — so it needs a person to work through
            it, not a button that guesses.
          </p>
          <p className=" mt-3 text-[15px] leading-[22px] text-muted-foreground">
            Reply to any email from Talent4u and ask us to delete your account; we will confirm what
            goes and what stays before anything is removed. If you only want to disappear from the
            public site, deactivating above does that immediately and is reversible.
          </p>
        </section>

        {/* ── Deleting the account ────────────────────────────────────── */}
        {/* Last on the page, and the only destructive thing on it. Separated
            from deactivation above because they are genuinely different: one
            takes your page down and is reversible in a click, the other
            removes you and is not reversible at all. */}
        <section aria-labelledby="delete-heading" className="mt-14 border-t border-border pt-8">
          <h2 id="delete-heading" className="t-subhead text-destructive">
            Delete your account
          </h2>
          <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
            This cannot be undone. Your name, contact details, links and{" "}
            {view.role === "FREELANCER" ? "skills" : "company details"} are removed, you are signed
            out, and you will not be able to sign in again.
          </p>
          <p className="measure mt-3 text-[15px] leading-[22px] text-muted-foreground">
            What stays: the applications you sent, any engagements both sides confirmed, and
            reviews written about you — with your name replaced. Those belong to the person on the
            other side of them as much as to you, and deleting them would rewrite their record.
            {view.role === "RECRUITER" ? " Your open roles are closed." : ""}
          </p>
          <p className="measure mt-3 text-[15px] leading-[22px] text-muted-foreground">
            If you only want to disappear from search and public pages, use{" "}
            <span className="font-medium text-foreground">
              Deactivate public {publicNoun}
            </span>{" "}
            above instead — that keeps your account and is reversible whenever you like.
          </p>

          <form action={deleteAccount} className="surface-card mt-6 max-w-xl p-5">
            <Field
              label={`Type ${view.email} to confirm`}
              htmlFor="confirmEmail"
              hint="Deleting is permanent. We ask for your address so it cannot happen by accident."
            >
              <Input
                id="confirmEmail"
                name="confirmEmail"
                type="email"
                autoComplete="off"
                spellCheck={false}
                placeholder={view.email}
                required
              />
            </Field>
            <Button type="submit" variant="destructive" className="mt-4">
              Delete my account permanently
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
