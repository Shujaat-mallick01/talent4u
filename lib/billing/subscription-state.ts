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
 *   - `incomplete` means the very first payment has not succeeded — a declined
 *     card, or a 3-D Secure prompt someone walked away from. It is NOT active,
 *     and it is NOT past due either: nothing ever started, and Stripe expires
 *     it to `incomplete_expired` within 23 hours on its own. It maps to
 *     CANCELED, which is the same FREE entitlement PAST_DUE would give but
 *     ALSO lets the person try again — mapping it to PAST_DUE locked someone
 *     whose card bounced out of checkout for a day, on the strength of a
 *     subscription they had never once paid for.
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
    case "incomplete":
      return "CANCELED";
    case "past_due":
    case "unpaid":
    case "paused":
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
  items?: {
    data?: Array<{
      current_period_end?: number | null;
      /** The product is the only field that follows a portal plan switch. */
      price?: { product?: string | { id?: string } | null } | null;
    }>;
  } | null;
  /**
   * Where this lived before the 2026 API moved it onto the items. Read as a
   * fallback rather than dropped: `constructEventAsync` only parses bytes, and
   * the payload is rendered at the version pinned on the ENDPOINT in the
   * Stripe dashboard, which is not necessarily the version this client pins.
   * Without the fallback, an endpoint on an older version silently stores a
   * null period end on every subscription — and a null period end is what
   * switches the whole grace-expiry safety net off.
   */
  current_period_end?: number | null;
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
export function subscriptionStateFrom(
  sub: StripeSubscriptionShape,
  /**
   * The plan the subscription is actually BILLING for, resolved from its
   * product. Wins over metadata when known, and it has to: Stripe updates a
   * subscription's items in place when someone switches plan in the customer
   * portal, and never touches `metadata`. Trusting metadata alone means a
   * customer who upgrades in the portal pays the new price and keeps the old
   * plan's entitlements, permanently, with no later event to correct it.
   */
  planFromProduct?: PlanTier | null,
): SubscriptionState | null {
  const plan = planFromProduct ?? parsePlanMetadata(sub.metadata?.plan);
  if (!plan) return null;

  // The 2026 API moved current_period_end off the subscription and onto each
  // item; every subscription we create has exactly one. The root field is read
  // as a fallback for endpoints pinned to an older version. Absent on both
  // means "unknown", which is null, not epoch zero.
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
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

// ── What a stored subscription is allowed to do ────────────────────────────

/**
 * Whether a status means "this subscription is the one currently in force".
 *
 * This decides which events may take an account's row OVER from a different
 * Stripe subscription. Only a live one may: an upgrade genuinely creates a new
 * subscription that replaces the old one, and the new one is active.
 *
 * Everything else — cancelled, past due — may only affect the subscription the
 * row already tracks. Without that rule, the `customer.subscription.deleted`
 * for a subscription that an upgrade already replaced would arrive afterwards,
 * resolve to the same account, and wipe the upgrade the customer just paid for.
 */
export function isLiveStatus(status: SubscriptionStatus): boolean {
  return status === "ACTIVE" || status === "TRIALING";
}

/**
 * How long a paid plan keeps working past the period end Stripe last told us
 * about.
 *
 * Our row only moves when a webhook arrives. If deliveries stop — endpoint
 * down, secret rotated, an event genuinely lost after Stripe gives up retrying
 * — an ACTIVE row would keep granting a paid plan forever, including to
 * somebody who cancelled. This bounds that.
 *
 * Fourteen days is deliberately generous: longer than Stripe's three days of
 * webhook retries, and longer than any outage we could plausibly have without
 * noticing. A customer who is really paying is never cut off by a delivery
 * problem. The error it does allow is "a dead subscription kept working for a
 * fortnight", which is a revenue question rather than a support disaster —
 * that is the right way round for this to fail.
 */
export const ENTITLEMENT_GRACE_DAYS = 14;

export type StoredSubscription = {
  plan: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date | null;
};

/**
 * The plan an account is ENTITLED to, which is not always the plan it bought.
 *
 * One function so that every gate in the product answers this identically:
 * PAST_DUE and CANCELED read FREE, and so does a live-looking row whose period
 * ended long enough ago that we have clearly stopped hearing from Stripe.
 *
 * A null period end is "unknown", not "expired" — a partial webhook object can
 * leave it unset, and inventing an expiry from missing data would cut off a
 * paying customer over a field we simply did not receive.
 */
export function entitledPlanFrom(
  sub: StoredSubscription | null | undefined,
  now: Date = new Date(),
): PlanTier {
  if (!sub || !isLiveStatus(sub.status)) return "FREE";
  return isGraceExpired(sub, now) ? "FREE" : sub.plan;
}

/**
 * Whether the period Stripe last told us about ended long enough ago that we
 * have plainly stopped hearing from it.
 *
 * A null period end is "unknown", not "expired" — see entitledPlanFrom.
 */
export function isGraceExpired(
  sub: Pick<StoredSubscription, "currentPeriodEnd"> | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = sub?.currentPeriodEnd;
  if (!end) return false;
  return now.getTime() > end.getTime() + ENTITLEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Whether Stripe still holds a subscription for this account — which is the
 * real question behind "may they open a checkout".
 *
 * A second checkout while a subscription exists creates a SECOND subscription
 * and bills both, so this has to say yes whenever one is genuinely live. But
 * saying yes when one is NOT is just as damaging in the other direction: it
 * leaves a person with no way to start paying us and no button to press. Three
 * states that look like a subscription are therefore not one:
 *
 *   - CANCELED, including the `incomplete` checkout that never went through.
 *   - A row with no Stripe subscription id at all — `linkStripeCustomer`
 *     writes exactly that when checkout opens, and it is a customer record,
 *     not a subscription.
 *   - A row past the grace window. If Stripe had anything live it would have
 *     told us within fourteen days; the portal will show this person nothing
 *     to switch, so refusing them checkout strands them on FREE forever.
 */
export function subscriptionBlocksCheckout(
  sub:
    | (StoredSubscription & { stripeSubscriptionId?: string | null })
    | null
    | undefined,
  now: Date = new Date(),
): boolean {
  if (!sub || !sub.stripeSubscriptionId) return false;
  if (sub.status === "CANCELED") return false;
  return !isGraceExpired(sub, now);
}
