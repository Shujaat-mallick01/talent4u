import type { Metadata } from "next";

import { cn } from "@/lib/utils";
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
      className={cn(
        "surface-card flex flex-col p-6",
        // The featured plan is marked with a ring rather than a border, so it
        // does not become the one surface on the page carrying both a border
        // and a shadow. One red element per view, and on this page it is this.
        highlight && "ring-1 ring-primary",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="t-subhead">{card.copy.name}</h3>
        {card.price.isReduced ? (
          <span className="t-label text-success">Regional price</span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[15px] leading-[22px] text-muted-foreground">{card.copy.tagline}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="t-data tabular text-[32px] leading-none text-foreground">
          {card.price.display}
        </span>
        {card.price.cents > 0 ? (
          <span className="text-[15px] text-muted-foreground">/month</span>
        ) : null}
      </p>
      {card.price.isReduced ? (
        <p className="mt-1.5 text-[13px] leading-[18px] text-muted-foreground">
          <span className="tabular line-through">{card.listPrice.display}</span> standard
        </p>
      ) : null}

      <ul className="mt-5 flex-1 space-y-2">
        {card.features.map((f) => (
          <li key={f.label} className="flex gap-2.5 text-[15px] leading-[22px]">
            <span aria-hidden className={f.included ? "text-success" : "text-muted-foreground/50"}>
              {f.included ? "✓" : "—"}
            </span>
            <span className={f.included ? "" : "text-muted-foreground/70"}>
              {f.label}
              <span className="sr-only">{f.included ? " — included" : " — not included"}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="t-label mt-6 text-muted-foreground">
        {card.price.cents === 0 ? "Free, no card" : "Subscribe from your dashboard"}
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
      <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-14">
        <header className="text-center">
          <p className="t-label text-muted-foreground">Pricing</p>
          <h1 className="t-display-2 mt-3">
            We charge a subscription, never a cut.
          </h1>
          <p className="t-body mx-auto mt-4 max-w-2xl text-muted-foreground">
            0% commission on anyone&apos;s earnings. We do not hold, escrow, or transmit money
            between users — so there is nothing for us to take a percentage of.
          </p>
          {reduced ? (
            <p className="mx-auto mt-5 max-w-xl rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-[15px] leading-[22px] text-success">
              {BAND_SPECS[band].note}
              {billingCountry
                ? ` Prices below are for ${countryName(billingCountry) ?? billingCountry}.`
                : ""}
            </p>
          ) : null}
        </header>

        <section className="mt-12">
          <h2 className="t-subhead">For freelancers</h2>
          <p className="mt-1.5 text-[15px] leading-[22px] text-muted-foreground">
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
          <h2 className="t-subhead">For companies</h2>
          <p className="mt-1.5 text-[15px] leading-[22px] text-muted-foreground">
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

        <section className="mt-14">
          <h2 className="t-subhead">Questions people actually ask</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="surface-card p-5">
              <dt className="t-subhead text-[17px] leading-6">Do you take a percentage of what I earn?</dt>
              <dd className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
                No. Not on your first job, not on your hundredth. We never hold or transfer your
                money, so we are never in a position to take a cut of it. You invoice and get paid
                however you and the company agree.
              </dd>
            </div>
            <div className="surface-card p-5">
              <dt className="t-subhead text-[17px] leading-6">Why is my price different from the list price?</dt>
              <dd className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
                Prices are set per purchasing-power band from your billing country. The features are
                identical in every band — a reduced price is not a reduced product.
              </dd>
            </div>
            <div className="surface-card p-5">
              <dt className="t-subhead text-[17px] leading-6">Can I talk to people off-platform?</dt>
              <dd className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
                Yes, freely. Exchange emails, phone numbers, whatever suits you. We do not police
                that, and we never will — a marketplace that traps you is one that has to.
              </dd>
            </div>
            <div className="surface-card p-5">
              <dt className="t-subhead text-[17px] leading-6">What do you actually do, then?</dt>
              <dd className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
                Matching, verification, reputation, and discovery. We check who companies are, hold
                scam-pattern posts before they publish, publish every employer we remove, and lock
                reviews until both sides confirm the work happened.
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-14 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/jobs">Browse open jobs</Link>} />
          <Button size="lg" variant="outline" render={<Link href="/signup">Create a free account</Link>} />
        </section>
      </div>
    </main>
  );
}
