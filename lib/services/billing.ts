import type Stripe from "stripe";

import {
  getStripe,
  planForStripeProduct,
  stripeConfigured,
  stripeProductId,
} from "@/lib/billing/stripe";
import {
  canPurchase,
  cancelledState,
  entitledPlanFrom,
  isGraceExpired,
  isLiveStatus,
  purchasablePlans,
  subscriptionBlocksCheckout,
  subscriptionStateFrom,
  type StripeSubscriptionShape,
} from "@/lib/billing/subscription-state";
import {
  applySubscriptionState,
  findUserIdByStripeCustomer,
  getBillingState,
  linkStripeCustomer,
  setBillingCountryFromStripe,
  userExists,
  type BillingState,
} from "@/lib/db/subscription";
import { COUNTRIES } from "@/lib/geo/countries";
import type { PlanTier, SubscriptionStatus, UserRole } from "@/lib/generated/prisma/enums";
import { BAND_SPECS, bandForCountry, type PriceBand } from "@/lib/pricing/bands";
import { featuresFor, PLAN_COPY, type FeatureLine } from "@/lib/pricing/catalogue";
import { CURRENCY, formatMonthly, priceFor } from "@/lib/pricing/prices";
import { SITE_URL } from "@/lib/site-url";

/**
 * Subscription billing: checkout, the customer portal, and applying what Stripe
 * tells us afterwards.
 *
 * Three rules shape everything here.
 *
 * 1. The client never names a price. A checkout says which PLAN it wants; the
 *    amount is looked up from lib/pricing against the account's billing
 *    country. Accepting an amount from a form is how you get $0.01 Pro.
 *
 * 2. A lapse never destroys work. When a card fails, the subscription goes
 *    PAST_DUE, the entitlement layer falls back to FREE, and the effect is that
 *    NEW posts over the free cap are refused — existing ones stay live and
 *    every application already received stays readable. Deleting a company's
 *    job posts over a failed renewal would be an unforgivable way to treat a
 *    customer whose card simply expired.
 *
 * 3. Nothing here touches money between users. CLAUDE.md: subscriptions only,
 *    no Connect, no payouts. We charge our own fee and take 0% of anyone's
 *    earnings.
 */

// ── The billing screen ─────────────────────────────────────────────────────

export type BillingPlanOption = {
  plan: PlanTier;
  name: string;
  tagline: string;
  monthly: string;
  listMonthly: string;
  isReduced: boolean;
  features: FeatureLine[];
  /** True when this is the plan they are already paying for. */
  current: boolean;
  /**
   * True when this is the plan they bought but are not currently entitled to,
   * because payment lapsed. Without it a lapsed customer sees no card marked
   * as theirs and reasonably concludes they should buy one again.
   */
  onHold: boolean;
};

export type BillingView = {
  role: UserRole;
  /** What they are entitled to right now, after any lapse. */
  plan: PlanTier;
  planName: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** True once they have a Stripe customer — i.e. the portal has something in it. */
  hasBillingAccount: boolean;
  /**
   * False while Stripe still holds a subscription for this account. Changing
   * plan then belongs in the portal, where Stripe prorates it — a second
   * checkout would create a second subscription and bill both.
   */
  canCheckout: boolean;
  /**
   * True when the row still says ACTIVE but its period ended so long ago that
   * we have clearly stopped hearing from Stripe. The plan is gone and no
   * payment ever failed, so the page must say something other than "your card
   * was declined".
   */
  graceExpired: boolean;
  billingCountry: string | null;
  billingCountryName: string | null;
  band: PriceBand;
  bandLabel: string;
  bandNote: string;
  options: BillingPlanOption[];
  /** False when the deployment has no Stripe keys; every button is disabled. */
  available: boolean;
};

/**
 * Everything the billing page renders, resolved server-side.
 *
 * The plan reported here is the ENTITLED plan, not the plan that was bought: a
 * PAST_DUE subscription reads FREE, because that is what the rest of the
 * product will actually let them do. A page that says "Growth" while the job
 * form refuses a second post is a page that generates support tickets.
 */
export async function getBillingView(userId: string): Promise<BillingView | null> {
  const account = await getBillingState(userId);
  if (!account) return null;

  const sub = account.subscription;
  const entitledPlan = entitledPlanFrom(sub);
  // One shared rule with startCheckout, so the button the page renders and the
  // answer the server gives can never disagree.
  const hasStripeSubscription = subscriptionBlocksCheckout(sub);
  const graceExpired = sub !== null && isLiveStatus(sub.status) && isGraceExpired(sub);

  const band = bandForCountry(account.billingCountry);
  const country = account.billingCountry
    ? (COUNTRIES.find((c) => c.code === account.billingCountry)?.name ?? null)
    : null;

  const options = purchasablePlans(account.role).map((plan) => {
    const price = priceFor(plan, band);
    const copy = PLAN_COPY[plan];
    return {
      plan,
      name: copy.name,
      tagline: copy.tagline,
      monthly: formatMonthly(price),
      listMonthly: formatMonthly(priceFor(plan, "STANDARD")),
      isReduced: price.isReduced,
      features: featuresFor(copy.audience, plan),
      current: entitledPlan === plan,
      onHold: entitledPlan !== plan && sub?.plan === plan && hasStripeSubscription,
    };
  });

  return {
    role: account.role,
    plan: entitledPlan,
    planName: entitledPlan === "FREE" ? "Free" : PLAN_COPY[entitledPlan].name,
    status: sub?.status ?? "ACTIVE",
    // A period end in the past is not a renewal date. Reporting one as
    // "Renews 3 March" while the plan has already gone is worse than saying
    // nothing, so the view drops it and the page falls back to the truth.
    currentPeriodEnd:
      sub?.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
        ? sub.currentPeriodEnd
        : null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    hasBillingAccount: Boolean(sub?.stripeCustomerId),
    canCheckout: !hasStripeSubscription && !account.isBanned,
    graceExpired,
    billingCountry: account.billingCountry,
    billingCountryName: country,
    band,
    bandLabel: BAND_SPECS[band].label,
    bandNote: BAND_SPECS[band].note,
    options,
    available: stripeConfigured(),
  };
}

export type CheckoutResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "no-account"
        | "not-purchasable"
        | "already-on-plan"
        | "manage-in-portal"
        | "account-removed"
        | "stripe-error";
    };

const SUCCESS_PATH = "/dashboard/billing?notice=checkout_complete";
const CANCEL_PATH = "/dashboard/billing?notice=checkout_cancelled";

/**
 * Opens a Stripe Checkout session for a plan.
 *
 * Every gate is re-checked here against the database rather than trusted from
 * the page that rendered the button: whether the role may buy this plan at all
 * (a freelancer cannot buy a recruiter plan), and whether they are already on
 * it. The UI is cosmetic; the caller is curl.
 */
export async function startCheckout(userId: string, plan: PlanTier): Promise<CheckoutResult> {
  if (!stripeConfigured()) return { ok: false, reason: "unavailable" };

  const account = await getBillingState(userId);
  if (!account) return { ok: false, reason: "no-account" };
  if (!canPurchase(account.role, plan)) return { ok: false, reason: "not-purchasable" };
  // A removed employer cannot publish, message or be found, so a subscription
  // would buy them nothing at all. Charging someone monthly for a product the
  // moderation layer refuses on every call is not a thing to leave to the UI.
  if (account.isBanned) return { ok: false, reason: "account-removed" };

  // Checkout is for accounts Stripe holds no subscription for. Once one
  // exists, ANY change to it — a different plan, a recovered card — belongs in
  // the portal, because a second checkout creates a SECOND subscription and
  // bills both of them for overlapping months.
  const current = account.subscription;
  if (subscriptionBlocksCheckout(current)) {
    // "Already on plan" only if they are ENTITLED to it. A lapsed Growth row
    // is not "already on Growth" — it is a subscription to repair, and the
    // portal is where the card gets fixed.
    const samePlanAndLive = entitledPlanFrom(current) === plan;
    return { ok: false, reason: samePlanAndLive ? "already-on-plan" : "manage-in-portal" };
  }

  const band = bandForCountry(account.billingCountry);
  const price = priceFor(plan, band);
  // A zero price is not a checkout. Unreachable via canPurchase (FREE is never
  // purchasable), but it is the one mistake that would silently create a
  // free subscription, so it is checked rather than assumed.
  if (price.cents <= 0) return { ok: false, reason: "not-purchasable" };

  const stripe = getStripe();

  try {
    const customerId = await ensureCustomer(stripe, account);
    const productId = stripeProductId(plan);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY.toLowerCase(),
            unit_amount: price.cents,
            recurring: { interval: "month" },
            // A configured product keeps Stripe's reporting coherent; without
            // one, an ad-hoc product per checkout is the fallback so billing
            // works on a fresh account with nothing but a secret key.
            ...(productId
              ? { product: productId }
              : { product_data: { name: `Talent4u ${PLAN_COPY[plan].name}` } }),
          },
        },
      ],
      // Written on the SUBSCRIPTION, not just the session: this is what every
      // later webhook reads to know which plan and which account it is about.
      subscription_data: { metadata: { userId, plan, band } },
      metadata: { userId, plan, band },
      client_reference_id: userId,
      // Stripe verifies this against the card. It is the evidence behind the
      // purchasing-power band, and it is written back to the account.
      billing_address_collection: "required",
      allow_promotion_codes: true,
      // Sessions stay payable for 24 hours by default, and the gate above can
      // only see what a webhook has already written. That combination is how
      // two sessions opened minutes apart both get paid and the customer ends
      // up with two live subscriptions. Thirty minutes is Stripe's floor and
      // is far longer than filling in a card takes.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${SITE_URL}${SUCCESS_PATH}`,
      cancel_url: `${SITE_URL}${CANCEL_PATH}`,
    });

    if (!session.url) return { ok: false, reason: "stripe-error" };
    return { ok: true, url: session.url };
  } catch (error: unknown) {
    console.error("[billing] checkout failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "stripe-error" };
  }
}

/** The Stripe customer for an account, created and recorded on first need. */
async function ensureCustomer(stripe: Stripe, account: BillingState): Promise<string> {
  const existing = account.subscription?.stripeCustomerId;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: account.email,
    // So a support question in the Stripe dashboard can be traced back here
    // without a database lookup.
    metadata: { userId: account.userId, role: account.role },
  });
  await linkStripeCustomer(account.userId, customer.id);
  return customer.id;
}

export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: "unavailable" | "no-account" | "no-customer" | "stripe-error" };

/**
 * Opens the Stripe customer portal.
 *
 * Cancelling, changing a card, and downloading invoices all live there rather
 * than being rebuilt here. That is not laziness: card details must never reach
 * our servers, and a cancel button of our own would be a second source of truth
 * about a subscription Stripe already owns.
 */
export async function openBillingPortal(userId: string): Promise<PortalResult> {
  if (!stripeConfigured()) return { ok: false, reason: "unavailable" };

  const account = await getBillingState(userId);
  if (!account) return { ok: false, reason: "no-account" };

  const customerId = account.subscription?.stripeCustomerId;
  // Never create a customer here. No customer means they have never checked
  // out, so there is nothing to manage, and conjuring one produces an empty
  // portal that looks broken.
  if (!customerId) return { ok: false, reason: "no-customer" };

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/dashboard/billing`,
    });
    return { ok: true, url: session.url };
  } catch (error: unknown) {
    // The commonest cause is a live-mode portal that has never been configured
    // in the Stripe dashboard, which is a setup problem, not a code one.
    console.error("[billing] portal failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "stripe-error" };
  }
}

// ── Webhook application ────────────────────────────────────────────────────

export type WebhookOutcome =
  | { handled: true; detail: string }
  | { handled: false; detail: string };

/**
 * Applies one verified Stripe event.
 *
 * The caller has already checked the signature — this function trusts that the
 * event came from Stripe, and nothing else about it. Whose account it concerns
 * is resolved from metadata we wrote ourselves, falling back to the customer id
 * we recorded; an event that resolves to neither is reported, never guessed at.
 *
 * Every branch is idempotent: the state written is derived entirely from the
 * event, so a redelivery writes the same row. Out-of-order delivery is handled
 * one layer down, by the timestamp guard in applySubscriptionState.
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const eventAt = new Date(event.created * 1000);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = await resolveUserId(session.metadata?.userId, session.customer);
      if (!userId) return { handled: false, detail: "checkout session resolved to no account" };

      // The address Stripe verified against the card. Applies to the next
      // purchase; the amount on this one is already fixed.
      const country = session.customer_details?.address?.country;
      if (country) await setBillingCountryFromStripe(userId, country);

      const subscriptionId = idOf(session.subscription);
      if (!subscriptionId) {
        return { handled: false, detail: "checkout session carried no subscription" };
      }

      // Fetched rather than trusted from the session: the session's copy is
      // partial, and subscription.created may not have arrived yet. This makes
      // the completed checkout self-sufficient in either order.
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      return applySubscription(userId, subscription, eventAt, event.type);
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const userId = await resolveUserId(subscription.metadata?.userId, subscription.customer);
      if (!userId) return { handled: false, detail: "subscription resolved to no account" };
      return applySubscription(userId, subscription, eventAt, event.type);
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = idOf(invoice.customer);
      const userId = await resolveUserId(undefined, invoice.customer);
      if (!userId) return { handled: false, detail: "invoice resolved to no account" };
      // Deliberately does NOT write a status. Stripe decides when a failure
      // becomes past_due (it retries for days first), and it says so with a
      // subscription.updated event. Marking a plan lapsed on the first failed
      // attempt would cut off a customer Stripe is still successfully retrying.
      console.warn(`[billing] payment failed for user ${userId} (customer ${customerId})`);
      return { handled: true, detail: "payment failure logged; status follows from Stripe" };
    }

    default:
      // Stripe sends whatever the endpoint is subscribed to; anything we do not
      // model is acknowledged so it is not retried forever.
      return { handled: false, detail: `unhandled event type ${event.type}` };
  }
}

async function applySubscription(
  userId: string,
  subscription: StripeSubscriptionShape & { customer?: unknown },
  eventAt: Date,
  eventType: string,
): Promise<WebhookOutcome> {
  const ended = eventType === "customer.subscription.deleted";
  // The product on the subscription's item, which is the only thing that
  // follows a plan switch made in the customer portal — Stripe swaps the items
  // and leaves metadata naming whatever they first bought.
  const planFromProduct = planForStripeProduct(
    idOf(subscription.items?.data?.[0]?.price?.product),
  );
  const state = ended
    ? cancelledState(subscription.id)
    : subscriptionStateFrom(subscription, planFromProduct);

  if (!state) {
    // We set metadata.plan on every subscription we create, so its absence
    // means this subscription did not come from this codebase. Granting a plan
    // on a guess would hand out entitlements nobody paid for.
    return { handled: false, detail: `subscription ${subscription.id} carries no plan metadata` };
  }

  const result = await applySubscriptionState({
    userId,
    stripeCustomerId: idOf(subscription.customer),
    stripeSubscriptionId: state.stripeSubscriptionId,
    plan: state.plan,
    status: state.status,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    priceRegion: state.priceRegion,
    eventAt,
  });

  if (result === "conflict") {
    console.error(
      `[billing] subscription ${state.stripeSubscriptionId} is already held by another account; refusing to move it`,
    );
    return { handled: false, detail: "subscription belongs to a different account" };
  }
  if (result === "superseded") {
    // The classic case: an upgrade replaced this subscription, and Stripe is
    // now telling us the OLD one ended. Applying it would cancel the plan the
    // customer is currently paying for.
    //
    // Logged rather than passed over in silence: an account whose old
    // subscription is ending is the normal case, but the SAME line appears
    // when two subscriptions are live at once and being billed twice, and
    // that is not something to discover from a customer's email.
    console.warn(
      `[billing] ${state.stripeSubscriptionId} reported ${eventType} for user ${userId}, which tracks a different subscription; skipped`,
    );
    return {
      handled: true,
      detail: `${state.stripeSubscriptionId} is not the subscription this account tracks; skipped`,
    };
  }
  if (result === "stale") {
    return { handled: true, detail: "older than the last event applied; skipped" };
  }
  return { handled: true, detail: `${state.plan} / ${state.status}` };
}

/**
 * Which account an event is about: our own metadata first, the customer id we
 * recorded second, nothing third. Never an email match — two accounts can share
 * an address, and a wrong answer here upgrades the wrong person.
 */
async function resolveUserId(
  metadataUserId: string | undefined,
  customer: unknown,
): Promise<string | null> {
  // Checked for existence, not just presence: an account deleted after it
  // subscribed would fail the upsert's foreign key and turn every redelivery
  // into a 500 that Stripe retries for days.
  if (typeof metadataUserId === "string" && metadataUserId.length > 0) {
    if (await userExists(metadataUserId)) return metadataUserId;
  }
  const customerId = idOf(customer);
  if (!customerId) return null;
  return findUserIdByStripeCustomer(customerId);
}

/** Stripe returns either an id or an expanded object for every relation. */
function idOf(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }
  return null;
}
