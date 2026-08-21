import type { PlanTier } from "@/lib/generated/prisma/enums";

import { bandForCountry, type PriceBand } from "./bands";

/**
 * The amounts. This table is the ONLY place a price exists in this codebase —
 * CLAUDE.md: "Never hardcode USD amounts in components — read from `pricing`
 * config."
 *
 * Stored in integer cents, never floats: 0.1 + 0.2 problems in a billing path
 * are not worth the convenience, and Stripe takes cents anyway.
 *
 * Everything is charged in USD across all bands. We are not localising the
 * currency, only the amount — a single currency keeps the Stripe catalogue and
 * our own reporting honest, and our audience already transacts in USD.
 *
 * The STANDARD column is the list price named in CLAUDE.md: Pro $6/mo,
 * Growth $79/mo, Team $249/mo. The other bands are reductions from it.
 */

export const CURRENCY = "USD" as const;

/** Monthly price in cents, by plan and band. FREE is free everywhere. */
const MONTHLY_CENTS: Record<PlanTier, Record<PriceBand, number>> = {
  FREE: { STANDARD: 0, MID: 0, LOW: 0 },
  FREELANCER_PRO: { STANDARD: 600, MID: 400, LOW: 300 },
  RECRUITER_GROWTH: { STANDARD: 7900, MID: 4900, LOW: 2900 },
  RECRUITER_TEAM: { STANDARD: 24900, MID: 15900, LOW: 9900 },
};

export type Price = {
  plan: PlanTier;
  band: PriceBand;
  /** Integer cents. What Stripe is handed. */
  cents: number;
  currency: typeof CURRENCY;
  /** "$6" / "$2.50" / "Free" — what a person reads. */
  display: string;
  /** True when this band pays less than the list price. */
  isReduced: boolean;
};

/**
 * Two formatters, not one with a 0–2 digit range: that range renders 250c as
 * "$2.5", which reads as a typo rather than a price. Whole dollars get no
 * decimals, anything with cents gets exactly two.
 */
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Cents to a readable amount. Whole dollars lose the ".00" — "$79" reads as a
 * price, "$79.00" reads as an invoice.
 */
export function formatCents(cents: number): string {
  if (cents === 0) return "Free";
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usdCents.format(cents / 100);
}

export function priceFor(plan: PlanTier, band: PriceBand): Price {
  const cents = MONTHLY_CENTS[plan][band];
  return {
    plan,
    band,
    cents,
    currency: CURRENCY,
    display: formatCents(cents),
    isReduced: cents > 0 && cents < MONTHLY_CENTS[plan].STANDARD,
  };
}

/** The same, resolving the band from a billing country. */
export function priceForCountry(plan: PlanTier, country: string | null | undefined): Price {
  return priceFor(plan, bandForCountry(country));
}

/** The list price, for "normally $79" comparisons next to a reduced one. */
export function listPriceFor(plan: PlanTier): Price {
  return priceFor(plan, "STANDARD");
}

/**
 * "$6/mo" — the form nearly every upsell string needs. Kept here so no
 * component ever has to concatenate a price with a period itself.
 */
export function formatMonthly(price: Price): string {
  return price.cents === 0 ? "Free" : `${price.display}/mo`;
}
