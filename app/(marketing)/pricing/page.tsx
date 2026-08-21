import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { countryName } from "@/lib/geo/countries";
import { BAND_SPECS, isReducedBand } from "@/lib/pricing/bands";
import {
  freelancerPlanCards,
  recruiterPlanCards,
  type PlanCard,
} from "@/lib/pricing/catalogue";
import { getViewerEntitlements } from "@/lib/services/entitlements";
import { SITE_URL } from "@/lib/site-url";

/**
 * Public pricing. Every number on this page is read from lib/pricing — there
 * is no price literal in this file, per CLAUDE.md, and the feature lists are
 * derived from the same entitlements object the services enforce.
 *
 * Prices shown are the VIEWER's band: a signed-in user with a billing country
 * in a reduced band sees their own price, not the list price. Logged-out
 * visitors see the standard price, since we do not guess a discount from an
 * IP address.
 */

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Flat monthly subscriptions, 0% commission. Freelancers keep 100% of what they earn. Regionally priced by purchasing power.",
  alternates: { canonical: `${SITE_URL}/pricing` },
  robots: { index: true, follow: true },
};

function PlanColumn({ card, highlight }: { card: PlanCard; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-col border p-5 ${
        highlight ? "border-primary" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{card.copy.name}</h3>
        {card.price.isReduced ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-success">
            Regional price
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{card.copy.tagline}</p>

      <p className="mt-4">
        <span className="text-3xl font-bold tracking-tight">{card.price.display}</span>
        {card.price.cents > 0 ? (
          <span className="text-sm text-muted-foreground"> /month</span>
        ) : null}
      </p>
      {card.price.isReduced ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="line-through">{card.listPrice.display}</span> standard
        </p>
      ) : null}

      <ul className="mt-4 flex-1 space-y-1.5 text-sm">
        {card.features.map((f) => (
          <li key={f.label} className="flex gap-2">
            <span
              aria-hidden
              className={f.included ? "text-success" : "text-muted-foreground/50"}
            >
              {f.included ? "✓" : "—"}
            </span>
            <span className={f.included ? "" : "text-muted-foreground/70"}>
              {f.label}
              <span className="sr-only">{f.included ? " — included" : " — not included"}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {card.price.cents === 0 ? "Available now" : "Billing launches soon"}
      </p>
    </div>
  );
}

export default async function PricingPage() {
  const { band, billingCountry } = await getViewerEntitlements();
  const freelancer = freelancerPlanCards(band);
  const recruiter = recruiterPlanCards(band);
  const reduced = isReducedBand(band);

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-14">
        <header className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Pricing</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            We charge a subscription, never a cut.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            0% commission on anyone&apos;s earnings. We do not hold, escrow, or transmit money
            between users — so there is nothing for us to take a percentage of.
          </p>
          {reduced ? (
            <p className="mx-auto mt-4 max-w-xl rounded-[2px] border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              {BAND_SPECS[band].note}
              {billingCountry
                ? ` Prices below are for ${countryName(billingCountry) ?? billingCountry}.`
                : ""}
            </p>
          ) : null}
        </header>

        <section className="mt-12">
          <h2 className="text-sm font-semibold">For freelancers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browsing and applying is free. Pro is for people applying every week.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {freelancer.map((card) => (
              <PlanColumn
                key={card.copy.plan}
                card={card}
                highlight={card.copy.plan === "FREELANCER_PRO"}
              />
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-semibold">For companies</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Post free. Candidate search, filters, and pipelines are the paid features.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {recruiter.map((card) => (
              <PlanColumn
                key={`${card.copy.audience}-${card.copy.plan}`}
                card={card}
                highlight={card.copy.plan === "RECRUITER_GROWTH"}
              />
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-sm font-semibold">Questions people actually ask</h2>
          <dl className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="font-medium">Do you take a percentage of what I earn?</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                No. Not on your first job, not on your hundredth. We never hold or transfer your
                money, so we are never in a position to take a cut of it. You invoice and get paid
                however you and the company agree.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Why is my price different from the list price?</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Prices are set per purchasing-power band from your billing country. The features are
                identical in every band — a reduced price is not a reduced product.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Can I talk to people off-platform?</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Yes, freely. Exchange emails, phone numbers, whatever suits you. We do not police
                that, and we never will — a marketplace that traps you is one that has to.
              </dd>
            </div>
            <div>
              <dt className="font-medium">What do you actually do, then?</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                Matching, verification, reputation, and discovery. We check who companies are, hold
                scam-pattern posts before they publish, publish every employer we remove, and lock
                reviews until both sides confirm the work happened.
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-12 flex flex-wrap items-center justify-center gap-3 border-t border-border pt-8">
          <Button size="lg" render={<Link href="/jobs">Browse open jobs</Link>} />
          <Button size="lg" variant="outline" render={<Link href="/signup">Create a free account</Link>} />
        </section>
      </div>
    </main>
  );
}
