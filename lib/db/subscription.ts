import type { PlanTier, SubscriptionStatus, UserRole } from "@/lib/generated/prisma/enums";
import { isUuid } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * Prisma access for subscriptions. Rules live in lib/services/billing.ts and
 * lib/billing/; this file only reads and writes rows.
 *
 * Two things are decided here because they are storage concerns:
 *   - The out-of-order guard. Stripe delivers at least once and unordered, so
 *     every write carries the event's timestamp and an older one is dropped.
 *   - Which row a webhook belongs to. Stripe knows a customer id; we resolve it
 *     to a user, and refuse rather than guess when it resolves to nobody.
 */

export type BillingState = {
  userId: string;
  role: UserRole;
  email: string;
  billingCountry: string | null;
  subscription: {
    plan: PlanTier;
    status: SubscriptionStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    priceRegion: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

/** Everything the billing page and checkout need about one account. */
export async function getBillingState(userId: string): Promise<BillingState | null> {
  if (!isUuid(userId)) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      email: true,
      billingCountry: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          priceRegion: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    role: user.role,
    email: user.email,
    billingCountry: user.billingCountry,
    subscription: user.subscription,
  };
}

/**
 * Records the Stripe customer for an account, creating the subscription row if
 * this is their first checkout.
 *
 * The row starts on FREE: a customer exists the moment checkout opens, which is
 * well before anyone has paid. Only a webhook moves the plan.
 */
export async function linkStripeCustomer(userId: string, stripeCustomerId: string): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, stripeCustomerId },
    update: { stripeCustomerId },
  });
}

/**
 * Confirms an id off webhook metadata still names a live account.
 *
 * Worth a query: an account deleted after it subscribed would otherwise reach
 * the upsert, fail its foreign key, and turn every redelivery of that event
 * into a 500 that Stripe retries for three days.
 */
export async function userExists(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user !== null;
}

/** The account behind a Stripe customer id, when a webhook carries no metadata. */
export async function findUserIdByStripeCustomer(
  stripeCustomerId: string,
): Promise<string | null> {
  const row = await prisma.subscription.findUnique({
    where: { stripeCustomerId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

export type ApplySubscriptionArgs = {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  priceRegion: string | null;
  /** `created` on the Stripe event this state came from. */
  eventAt: Date;
};

export type ApplyResult = "applied" | "stale" | "conflict";

/**
 * Writes subscription state from a webhook, unless a newer event already ran.
 *
 * The staleness check and the write are one transaction with the row locked, so
 * two webhook deliveries arriving together cannot both read "nothing newer" and
 * both write — the second sees the first's timestamp and drops.
 *
 * Returns "conflict" when the Stripe subscription id belongs to a DIFFERENT
 * user's row. That is not a race, it is a broken assumption (one subscription,
 * one account), and it must be logged rather than resolved by overwriting
 * somebody else's plan.
 */
export async function applySubscriptionState(args: ApplySubscriptionArgs): Promise<ApplyResult> {
  const {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    priceRegion,
    eventAt,
  } = args;

  return prisma.$transaction(async (tx) => {
    // Whoever currently holds this Stripe subscription id. @unique means at
    // most one row can, so a mismatch is a real problem and not a race.
    const holder = await tx.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { userId: true },
    });
    if (holder && holder.userId !== userId) return "conflict" as const;

    const existing = await tx.subscription.findUnique({
      where: { userId },
      select: { lastStripeEventAt: true },
    });

    // Strictly older is dropped. Equal is applied: two events can share a
    // second, and re-applying the same state is a no-op by construction.
    if (existing?.lastStripeEventAt && existing.lastStripeEventAt > eventAt) {
      return "stale" as const;
    }

    const state = {
      plan,
      status,
      stripeSubscriptionId,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      priceRegion,
      lastStripeEventAt: eventAt,
      // Never clear a customer id we already hold: not every event carries one,
      // and losing it would orphan the account from its billing portal.
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
    };

    await tx.subscription.upsert({
      where: { userId },
      create: { userId, ...state },
      update: state,
    });
    return "applied" as const;
  });
}

/**
 * The billing country as Stripe collected it at checkout.
 *
 * Stripe verified this address against the card; whatever the person had
 * previously set is a claim, and this is evidence, so it wins. It applies to
 * the NEXT purchase — the amount on a live subscription is fixed at creation
 * and is not retroactively re-banded here.
 */
export async function setBillingCountryFromStripe(
  userId: string,
  country: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { billingCountry: country.trim().toUpperCase() },
  });
}
