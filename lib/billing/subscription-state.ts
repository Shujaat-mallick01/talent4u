import type { PlanTier, SubscriptionStatus, UserRole } from "@/lib/generated/prisma/enums";

/**
 * The pure half of billing: which plans a role may buy, and what a Stripe
 * subscription object means in our vocabulary.
 *
 * Everything here is a total function over plain data — no client, no network,
 * no database — because these are the decisions that must never be wrong and
 * therefore must be exhaustively testable. The I/O lives in
 * lib/services/billing.ts.
 */

/** The plans a role may actually purchase. Anything else is refused server-side. */
export function purchasablePlans(role: UserRole | null): PlanTier[] {
  switch (role) {
    case "FREELANCER":
      return ["FREELANCER_PRO"];
    case "RECRUITER":
      return ["RECRUITER_GROWTH", "RECRUITER_TEAM"];
    default:
      // ADMIN and logged-out. An admin account is staff, not a customer; there
      // is no plan whose entitlements would mean anything to it.
      return [];
  }
}

/**
 * May this account buy this plan? The UI only renders buttons for plans that
 * pass, but this is the check that counts — the caller is curl.
 */
export function canPurchase(role: UserRole | null, plan: PlanTier): boolean {
  return purchasablePlans(role).includes(plan);
}

/**
 * The audience a plan belongs to, for copy. FREE is deliberately absent: it is
 * one row in the enum but two different products, and neither is purchasable.
 */
export function planAudience(plan: PlanTier): UserRole | null {
  switch (plan) {
    case "FREELANCER_PRO":
      return "FREELANCER";
    case "RECRUITER_GROWTH":
    case "RECRUITER_TEAM":
      return "RECRUITER";
    default:
      return null;
  }
}

/**
 * Stripe's subscription status, compressed into ours.
 *
 * Stripe has eight; we have four. The compression is where the money decisions
 * live, so it is written out case by case rather than defaulted:
 *
 *   - `incomplete` means the very first payment has not succeeded. It is NOT
 *     active — treating it as active would hand out a paid plan to anyone who
 *     opens a checkout and abandons it at the card form.
 *   - `unpaid` and `paused` are both "we are not being paid right now". They
 *     land on PAST_DUE, which the entitlement layer already treats as FREE.
 *   - `incomplete_expired` is a subscription that never started. CANCELED.
 *
 * Anything unrecognised — a status Stripe adds after this was written — is
 * PAST_DUE, not ACTIVE. The failure mode of guessing wrong should be a person
 * asking why their plan lapsed, not a plan being given away.
 */
export function toSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "past_due":
    case "unpaid":
    case "paused":
    case "incomplete":
      return "PAST_DUE";
    default:
      return "PAST_DUE";
  }
}

const PLAN_TIERS = new Set<string>([
  "FREE",
  "FREELANCER_PRO",
  "RECRUITER_GROWTH",
  "RECRUITER_TEAM",
]);

/** A PlanTier off untrusted metadata, or null. FREE is not a purchasable plan. */
export function parsePlanMetadata(value: unknown): PlanTier | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (!PLAN_TIERS.has(upper) || upper === "FREE") return null;
  return upper as PlanTier;
}

/**
 * The narrow shape we actually read off a Stripe subscription.
 *
 * Declared structurally rather than as Stripe.Subscription so the mapping can
 * be tested against hand-written fixtures — including the malformed ones a
 * webhook can genuinely deliver — without constructing forty unrelated fields.
 */
export type StripeSubscriptionShape = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean | null;
  metadata?: Record<string, string> | null;
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
};

export type SubscriptionState = {
  stripeSubscriptionId: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** The band recorded at purchase, for "what did they actually pay" questions. */
  priceRegion: string | null;
};

/**
 * A Stripe subscription, as our row.
 *
 * Returns null when the plan cannot be determined. That is a refusal, not a
 * default: we set `metadata.plan` ourselves at checkout, so its absence means
 * this subscription was created by something other than this codebase, and
 * guessing a plan would hand out entitlements nobody paid for.
 *
 * A subscription that has ENDED is the exception — a cancelled subscription
 * carries no entitlement whatever its plan was, so it is safe to record
 * without one. That case is handled by cancelledState() rather than here.
 */
export function subscriptionStateFrom(sub: StripeSubscriptionShape): SubscriptionState | null {
  const plan = parsePlanMetadata(sub.metadata?.plan);
  if (!plan) return null;

  // The 2026 API moved current_period_end off the subscription and onto each
  // item; every subscription we create has exactly one. Absent (or a partial
  // object from a webhook) means "unknown", which is null, not epoch zero.
  const periodEnd = sub.items?.data?.[0]?.current_period_end;
  const region = sub.metadata?.band;

  return {
    stripeSubscriptionId: sub.id,
    plan,
    status: toSubscriptionStatus(sub.status),
    currentPeriodEnd:
      typeof periodEnd === "number" && Number.isFinite(periodEnd) && periodEnd > 0
        ? new Date(periodEnd * 1000)
        : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    priceRegion: typeof region === "string" && region.length > 0 ? region : null,
  };
}

/**
 * The state a deleted subscription leaves behind.
 *
 * Plan drops to FREE and the period end is cleared. Deliberately NOT "keep the
 * plan until currentPeriodEnd": Stripe only sends the delete once the period is
 * genuinely over (a cancel-at-period-end sits as ACTIVE with the flag set until
 * then), so by the time this arrives there is nothing left to honour.
 */
export function cancelledState(stripeSubscriptionId: string): SubscriptionState {
  return {
    stripeSubscriptionId,
    plan: "FREE",
    status: "CANCELED",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    priceRegion: null,
  };
}
