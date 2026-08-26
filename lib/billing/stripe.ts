import "server-only";

import Stripe from "stripe";

import type { PlanTier } from "@/lib/generated/prisma/enums";

/**
 * The Stripe client, and the only place its configuration is read.
 *
 * CLAUDE.md is emphatic about the shape of this integration: "Stripe —
 * subscriptions only. No Connect, no payouts, no marketplace payments." We take
 * 0% of anyone's earnings, so money between a recruiter and a freelancer never
 * touches this codebase. The only charge that exists is our own subscription
 * fee, billed by us, to us.
 *
 * The client is lazy on purpose. Building it at import time would make every
 * page in the app — including the entirely public ones — fail to render on a
 * deployment that has not configured billing yet.
 */

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").trim().length > 0;
}

export function webhookSecret(): string | null {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  return secret.length > 0 ? secret : null;
}

export function getStripe(): Stripe {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Billing is disabled until it is; see .env.example.",
    );
  }
  // The key can only change on a restart, so one client per process is right.
  client ??= new Stripe(key, {
    // Pinned deliberately. An unpinned integration silently changes shape when
    // Stripe ships a new version — which is exactly how current_period_end
    // moved off the subscription and onto its items.
    apiVersion: "2026-07-29.dahlia",
    appInfo: { name: "Talent4u", url: "https://talent4u.com" },
    // Vercel functions are short-lived; a hung request is worse than a retry.
    timeout: 20_000,
    maxNetworkRetries: 2,
  });
  return client;
}

/**
 * The Stripe Product each plan bills against, when the catalogue has been set
 * up in the dashboard.
 *
 * We send the AMOUNT from lib/pricing on every checkout (price_data) rather
 * than pre-creating nine Price objects — three plans times three purchasing
 * power bands — because CLAUDE.md makes lib/pricing the single source of truth
 * and a second copy in the Stripe dashboard is a second thing to keep in sync.
 *
 * The product is worth configuring anyway: without one, Stripe creates a fresh
 * ad-hoc Product per checkout, and a year later the dashboard has thousands of
 * them and revenue-per-product reporting is meaningless. With one, every Pro
 * subscription rolls up under one product at whatever band it was sold at.
 */
/**
 * Which plan a Stripe product IS — the reverse of stripeProductId.
 *
 * This is what makes a plan change in the customer portal readable. Stripe
 * swaps a subscription's items in place when someone switches plan there and
 * leaves `metadata` exactly as it was, so metadata reports the plan they
 * ORIGINALLY bought forever. The product on the item is the only field that
 * follows the money.
 *
 * Returns null when the catalogue has not been configured, in which case the
 * caller falls back to metadata — correct for every subscription created by
 * our own checkout, which is all of them until someone switches in the portal.
 * Configuring STRIPE_PRODUCT_* is therefore not decoration: it is what makes
 * portal plan changes take effect.
 */
export function planForStripeProduct(productId: string | null | undefined): PlanTier | null {
  if (!productId) return null;
  const plans: PlanTier[] = ["FREELANCER_PRO", "RECRUITER_GROWTH", "RECRUITER_TEAM"];
  return plans.find((plan) => stripeProductId(plan) === productId) ?? null;
}

export function stripeProductId(plan: PlanTier): string | null {
  const byPlan: Partial<Record<PlanTier, string | undefined>> = {
    FREELANCER_PRO: process.env.STRIPE_PRODUCT_FREELANCER_PRO,
    RECRUITER_GROWTH: process.env.STRIPE_PRODUCT_RECRUITER_GROWTH,
    RECRUITER_TEAM: process.env.STRIPE_PRODUCT_RECRUITER_TEAM,
  };
  const id = (byPlan[plan] ?? "").trim();
  return id.length > 0 ? id : null;
}
