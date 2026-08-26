import type { Metadata } from "next";
import Link from "next/link";

import { Orbit } from "@/components/brand/orbit";
import { Button } from "@/components/ui/button";
import {
  IconArrowRight,
  IconCheck,
  IconHandshakeless,
  IconShield,
} from "@/components/ui/icon";
import { getProof } from "@/lib/marketing/proof";
import { EARLY_ACCESS_HOURS, applicationQuotaForPlan } from "@/lib/pricing/plans";
import { SITE_URL } from "@/lib/site-url";

// Title comes from the root layout's title.default (identical string) —
// setting it here would run through the template and duplicate the brand.
export const metadata: Metadata = {
  description:
    "Post jobs and hire freelancers with 0% commission. Freelancers keep 100% of what they earn; companies pay a flat subscription, never a cut.",
  alternates: { canonical: SITE_URL },
};

/**
 * The landing page.
 *
 * The thesis is a number. Every other marketplace's business model is a
 * percentage of your invoice, and ours is zero — so the hero's signature is a
 * ledger that does the arithmetic on a real job rather than a headline that
 * claims to be different. It is specific, it is checkable, and it is the one
 * thing a competitor cannot copy without changing what they are.
 *
 * Set on the marketing register the brand separates out: 1240px container,
 * 128px between sections, 17px body in Graphite — not the 15px product density
 * used inside the dashboards.
 */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** The worked example. One real invoice, three fee models, three outcomes. */
const INVOICE = 5000;
const LEDGER = [
  { label: "A 20% platform fee", takes: INVOICE * 0.2 },
  { label: "A 10% platform fee", takes: INVOICE * 0.1 },
  { label: "Talent4u", takes: 0 },
] as const;

const PROMISES = [
  {
    icon: IconHandshakeless,
    title: "We never touch the money",
    body: "There is no escrow, no wallet, no payout. You and the company agree terms and pay each other directly — which is precisely why we are not in a position to take a percentage of it.",
  },
  {
    icon: IconShield,
    title: "Every employer is labelled honestly",
    body: "Unverified companies say Unverified on every post, in plain sight, and are capped at one live role. Posts matching known scam patterns are held for a human before they publish, never after.",
  },
  {
    icon: IconCheck,
    title: "Reviews only after both sides confirm",
    body: "We hold no payment data, so we do not pretend to know that work happened. Both parties confirm the rate and duration first. One side alone can never publish a review of the other.",
  },
] as const;

const STEPS = [
  {
    title: "Create a free profile",
    body: "Freelancers add skills and links to real work. Companies add a domain and a registration number, which is what earns the verified badge.",
  },
  {
    title: "Post or apply",
    body: "Browsing is free and unlimited for everyone, signed in or not. Free freelancers get 12 applications every 30 days; Pro removes the limit.",
  },
  {
    title: "Hire directly, then confirm",
    body: "Swap contact details, agree terms, work however suits you. Confirm the engagement afterwards and the two of you unlock reviews of each other.",
  },
] as const;

export default async function LandingPage() {
  const proof = await getProof();
  const freeQuota = applicationQuotaForPlan("FREE") ?? 12;

  return (
    <main id="main" className="flex-1">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* Sections alternate Paper and the sunken page colour rather than being
          divided by hairlines. Volume one used a 1px rule between every band,
          which reads as a wireframe grid; a change of ground reads as a change
          of subject. */}
      <section className="bg-card">
        <div className="mx-auto grid w-full max-w-[var(--container-marketing)] gap-12 px-6 py-20 lg:grid-cols-12 lg:gap-16 lg:py-32">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3">
              <Orbit className="size-7 text-primary" />
              <p className="t-label text-muted-foreground">
                The commission-free hiring marketplace
              </p>
            </div>

            <h1 className="t-display-1 mt-6">Keep 100% of what you earn.</h1>

            <p className="mt-6  t-body text-[color:var(--color-foreground)]/75">
              Companies pay a flat subscription to post. Freelancers apply and get hired directly.
              We take nothing from either side, because we are never holding the money in the first
              place.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" render={<Link href="/jobs">{proof.browseLabel}</Link>} />
              <Button
                size="lg"
                variant="outline"
                render={<Link href="/signup">Post a job free</Link>}
              />
            </div>

            <p className="t-label mt-6 text-muted-foreground">
              No card to sign up · {freeQuota} free applications every 30 days
            </p>
          </div>

          {/* The signature: the arithmetic, done. */}
          <aside className="lg:col-span-5">
            <div className="surface-card overflow-hidden">
              <p className="t-label border-b border-border px-5 py-3.5 text-muted-foreground">
                On {usd.format(INVOICE)} of work
              </p>
              <dl>
                {LEDGER.map((row) => {
                  const isUs = row.takes === 0;
                  return (
                    <div
                      key={row.label}
                      className={
                        "flex items-baseline justify-between gap-4 border-b border-border px-5 py-4" +
                        (isUs ? " bg-muted" : "")
                      }
                    >
                      <dt
                        className={
                          "text-[15px] " +
                          (isUs ? "font-semibold text-foreground" : "text-muted-foreground")
                        }
                      >
                        {row.label} takes
                      </dt>
                      <dd
                        className={
                          isUs
                            ? "t-data text-[32px] leading-none text-primary"
                            : "t-data text-muted-foreground"
                        }
                      >
                        {usd.format(row.takes)}
                      </dd>
                    </div>
                  );
                })}
                <div className="flex items-baseline justify-between gap-4 px-5 py-4">
                  <dt className="text-[15px] font-semibold">You keep</dt>
                  <dd className="t-data text-[32px] leading-none">{usd.format(INVOICE)}</dd>
                </div>
              </dl>
            </div>
            <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">
              Percentages are typical marketplace commission rates, not a specific competitor. Our
              own price is a flat monthly subscription —{" "}
              <Link href="/pricing" className="underline hover:text-foreground">
                see what it costs
              </Link>
              .
            </p>
          </aside>
        </div>
      </section>

      {/* ── What we actually do ──────────────────────────────────────────── */}
      <section>
        <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-20 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <h2 className="t-display-2">What we do instead</h2>
              <p className="mt-4  t-body text-[color:var(--color-foreground)]/75">
                Matching, verification, reputation and discovery. Not payments, not contracts, and
                not standing between you and the person you are working with.
              </p>
            </div>

            {/* Three cards, each led by a neutral chip. These are the three
                claims the whole product rests on, and a hairline-separated
                list gave them the visual weight of a settings page. */}
            <dl className="grid gap-4 lg:col-span-8">
              {PROMISES.map((promise) => (
                <div key={promise.title} className="surface-card flex gap-5 p-6">
                  <span className="chip chip-lg">
                    <promise.icon className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <dt className="t-subhead">{promise.title}</dt>
                    <dd className=" mt-2 text-[16px] leading-[26px] text-muted-foreground">
                      {promise.body}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="bg-card">
        <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-20 lg:py-32">
          <h2 className="t-display-2">How it works</h2>

          {/* Ordinals are earned here: this is a real sequence, and the order
              carries information the reader needs. Three abreast so the whole
              sequence is one glance rather than a scroll. */}
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="surface-card p-6">
                <span className="chip t-data text-[15px] text-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="t-subhead mt-4">{step.title}</h3>
                <p className="mt-2 text-[16px] leading-[26px] text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The numbers, and the way out ─────────────────────────────────── */}
      <section>
        <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-20 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <h2 className="t-display-2">Start free. Stay free if you want to.</h2>
              <p className="mt-4  t-body text-[color:var(--color-foreground)]/75">
                Browsing every job is free forever, signed in or not — job pages are public because
                they should be. Applying is free up to {freeQuota} a month. Posting your first role
                is free. Pro exists for people applying every week, and it costs less than one
                hour of most people&apos;s rate.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" render={<Link href="/signup">Create a free account</Link>} />
                <Button
                  size="lg"
                  variant="ghost"
                  render={
                    <Link href="/pricing">
                      See pricing
                      <IconArrowRight />
                    </Link>
                  }
                />
              </div>
            </div>

            <dl className="surface-card divide-y divide-border overflow-hidden lg:col-span-5">
              {proof.points.map((point) => (
                <div
                  key={point.label}
                  className="flex items-baseline justify-between gap-4 px-5 py-4"
                >
                  <dt className="t-label text-muted-foreground">{point.label}</dt>
                  <dd className="t-data text-[18px]">{point.value}</dd>
                </div>
              ))}
            </dl>
            <div className="lg:col-span-5 lg:col-start-8">
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                Pro members see new posts {EARLY_ACCESS_HOURS} hours before everyone else. Everyone
                sees every post eventually — the window delays, it never hides.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
