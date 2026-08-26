import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth/guards";
import { getBillingView } from "@/lib/services/billing";

import { openPortalAction, startCheckoutAction } from "./actions";
import { resolveBillingNotice } from "./notices";

export const metadata = { title: "Billing" };

const longDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Plan and billing, shared by both roles.
 *
 * Nothing rendered here grants anything. The plan shown is read from the row
 * the Stripe webhook writes, every button posts to a Server Action that
 * re-resolves the account from the session cookie, and the amount charged is
 * looked up server-side from lib/pricing — the form carries a plan name and
 * nothing else.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user } = await requireUser();
  const [view, params] = await Promise.all([getBillingView(user.id), searchParams]);

  // An admin has no plan: staff accounts are not customers, and purchasable
  // plans for them is an empty list. /dashboard routes them where they belong.
  if (!view || view.options.length === 0) redirect("/dashboard");

  const notice = resolveBillingNotice(params.notice);
  // A grace expiry is not a payment failure and must not borrow its copy.
  const lapsed = view.status === "PAST_DUE" && !view.graceExpired;

  return (
    <main id="main" className="flex-1">
      <div className="w-full max-w-3xl px-6 py-8 lg:px-8">
        <header className="mb-6 pb-4">
          <h1 className="t-heading">Plan and billing</h1>
          <p className=" mt-2 text-[15px] leading-[22px] text-muted-foreground">
            Subscriptions only. We never take a cut of what you earn, and no money between you and
            anyone you work with passes through us.
          </p>
        </header>

        {notice ? (
          <Notice tone={notice.tone} className="mb-8">
            {notice.message}
          </Notice>
        ) : null}

        {!view.available ? (
          <Notice tone="info" className="mb-8">
            Payments are not switched on for this deployment yet, so the buttons below will not do
            anything. Everything on the free plan works normally.
          </Notice>
        ) : null}

        {lapsed ? (
          <Notice tone="error" className="mb-8">
            Your last payment did not go through, so you are on free-plan limits for now. Nothing
            has been deleted — your posts, applications and messages are all still here. Update your
            card and the limits lift again.
          </Notice>
        ) : null}

        {/* Not a lapse, and saying so matters: nobody's card failed here. The
            subscription's billing period ended and Stripe never told us what
            happened next, so we stopped honouring a plan we can no longer see.
            Telling this person to update their card would send them to a
            portal with nothing in it. */}
        {view.graceExpired ? (
          <Notice tone="warning" className="mb-8">
            We have not had an update from Stripe about this subscription since its last billing
            period ended, so the account is on free-plan limits. Nothing has been deleted. If you
            cancelled, there is nothing more to do — if you did not, start it again below and it
            will pick up straight away.
          </Notice>
        ) : null}

        {view.cancelAtPeriodEnd && view.currentPeriodEnd ? (
          <Notice tone="info" className="mb-8">
            Your plan is set to end on {longDate.format(view.currentPeriodEnd)}. You keep everything
            it includes until then.
          </Notice>
        ) : null}

        {/* ── Current plan ────────────────────────────────────────────── */}
        <section aria-labelledby="current-heading">
          <h2 id="current-heading" className="t-subhead">
            Current plan
          </h2>

          <ul className="rowset mt-4">
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5">
              <span className="t-label text-muted-foreground">Plan</span>
              <span className="text-[15px] font-medium">{view.planName}</span>
            </li>
            {view.currentPeriodEnd && !view.cancelAtPeriodEnd ? (
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5">
                <span className="t-label text-muted-foreground">Renews</span>
                <span className="t-data">{longDate.format(view.currentPeriodEnd)}</span>
              </li>
            ) : null}
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5">
              <span className="t-label text-muted-foreground">Billing country</span>
              <span className="text-[15px] font-medium">
                {view.billingCountryName ?? view.billingCountry ?? "Not set"}
              </span>
            </li>
          </ul>

          <p className=" mt-4 text-[13px] leading-[18px] text-muted-foreground">
            {view.billingCountry
              ? `Prices below are the ${view.bandLabel.toLowerCase()} band for ${view.billingCountryName ?? view.billingCountry}. ${view.bandNote}`
              : "No billing country set, so prices below are the standard band. If you are billed from a country we price lower, set it before you subscribe — the amount is fixed when the subscription starts."}{" "}
            <Link
              href="/dashboard/settings"
              className="rounded-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Change it in settings
            </Link>
            .
          </p>

          {view.hasBillingAccount ? (
            <form action={openPortalAction} className="mt-4">
              <Button type="submit" variant="secondary" disabled={!view.available}>
                Manage billing
              </Button>
              <span className="ml-3 text-[13px] text-muted-foreground">
                Card, invoices, switching plan and cancelling — all on Stripe.
              </span>
            </form>
          ) : null}
        </section>

        {/* ── Plans ───────────────────────────────────────────────────── */}
        <section aria-labelledby="plans-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="plans-heading" className="t-subhead">
            {view.role === "FREELANCER" ? "Upgrade" : "Plans"}
          </h2>

          <ul className="mt-4 grid gap-px bg-border sm:grid-cols-2">
            {view.options.map((option) => (
              <li key={option.plan} className="bg-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[15px] font-semibold">{option.name}</h3>
                  <span className="t-data tabular">
                    {option.monthly}
                    {option.isReduced ? (
                      <span className="ml-2 text-muted-foreground line-through">
                        {option.listMonthly}
                      </span>
                    ) : null}
                  </span>
                </div>
                <p className=" mt-1 text-[13px] leading-[18px] text-muted-foreground">
                  {option.tagline}
                </p>

                <ul className="mt-3 space-y-1">
                  {option.features.map((feature) => (
                    <li
                      key={feature.label}
                      className={
                        feature.included
                          ? "text-[13px] leading-[18px]"
                          : "text-[13px] leading-[18px] text-muted-foreground line-through"
                      }
                    >
                      {feature.label}
                    </li>
                  ))}
                </ul>

                {option.current ? (
                  <p className="t-label mt-4 text-muted-foreground">Your current plan</p>
                ) : view.canCheckout ? (
                  <form action={startCheckoutAction} className="mt-4">
                    <input type="hidden" name="plan" value={option.plan} />
                    <Button type="submit" size="sm" disabled={!view.available}>
                      {/* One interpolated string, not two children: React
                          separates adjacent text nodes with a comment marker in
                          the server HTML, which breaks anything reading the
                          label back — including our own page verifier. */}
                      {`Get ${option.name}`}
                    </Button>
                  </form>
                ) : (
                  /* A subscription already exists with Stripe. Switching plan
                     or fixing a card happens in the portal, where the
                     difference is prorated — a second checkout here would bill
                     this person for two plans at once. */
                  <form action={openPortalAction} className="mt-4">
                    <Button type="submit" size="sm" variant="secondary" disabled={!view.available}>
                      {option.onHold ? "Fix payment in portal" : "Switch in billing portal"}
                    </Button>
                    {option.onHold ? (
                      <p className="t-label mt-2 text-muted-foreground">
                        Your plan, paused until payment goes through
                      </p>
                    ) : null}
                  </form>
                )}
              </li>
            ))}
          </ul>

          <p className=" mt-5 text-[13px] leading-[18px] text-muted-foreground">
            Payments are handled by Stripe; your card details never reach us. Cancelling stops the
            next charge and leaves everything you have already done in place —{" "}
            <Link
              href="/pricing"
              className="rounded-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              see every plan
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
