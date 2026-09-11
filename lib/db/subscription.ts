import { isLiveStatus } from "@/lib/billing/subscription-state";
import { Prisma } from "@/lib/generated/prisma/client";
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
  /**
   * Recruiters only, false for everyone else. A removed employer cannot
   * publish anything, so a subscription would buy them literally nothing —
   * startCheckout refuses rather than billing someone monthly for a product
   * the moderation layer is already turning down.
   */
  isBanned: boolean;
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
      recruiter: { select: { isBanned: true } },
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
    isBanned: user.recruiter?.isBanned ?? false,
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

export type ApplyResult = "applied" | "stale" | "superseded" | "conflict";

/** Stripe retries a webhook for three days; four is the safe side of that. */
const TAKEOVER_LOOKBACK_MS = 4 * 24 * 60 * 60 * 1000;

/**
 * Writes subscription state from a webhook, unless it must not be applied.
 *
 * Three refusals, and all three are decided by the WHERE clause of a single
 * conditional UPDATE rather than by reading the row and then writing it. That
 * distinction is the entire point. Postgres runs at READ COMMITTED, so a
 * read-then-write pair lets two deliveries arriving together BOTH see "nothing
 * newer" and both write, and the older one can land second. A conditional
 * update re-evaluates its own WHERE against the committed row it locks, so the
 * second one matches nothing and reports it.
 *
 *   - "stale" — older than the last event applied to the SAME subscription.
 *     Stripe delivers out of order, so a retried `created` must not resurrect
 *     a cancelled plan. The comparison is per-stream, not per-account: see the
 *     ordering note in the body.
 *   - "superseded" — a non-live event (cancelled, past due) naming a
 *     subscription this account no longer tracks. This is the upgrade case:
 *     the delete for the OLD subscription arrives after the new one is live,
 *     and applying it would cancel a plan the customer is currently paying for.
 *   - "conflict" — the Stripe subscription or customer id already belongs to a
 *     DIFFERENT account's row. Not a race, a broken assumption (one
 *     subscription, one account). Refused and logged rather than resolved by
 *     overwriting somebody else's plan.
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

  // ── Ordering ────────────────────────────────────────────────────────────
  //
  // `lastStripeEventAt` is ONE column on a per-account row, but the events
  // arriving are several per-subscription streams braided together, and an
  // upgrade is exactly that: the new subscription's opening events and the old
  // one's closing events, interleaved, delivered in an order Stripe does not
  // promise. A timestamp comparison that ignores WHICH stream an event came
  // from is therefore not an ordering at all — the old subscription's delete
  // legitimately carries a later `created` than the new subscription's create,
  // so applying the delete first would park the watermark ahead of every event
  // belonging to the subscription the customer is now paying for, and refuse
  // all of them as "stale" until the next renewal a month later.
  //
  // So the watermark only orders events WITHIN the stream it came from.
  const notOlder: Prisma.SubscriptionWhereInput = {
    OR: [{ lastStripeEventAt: null }, { lastStripeEventAt: { lte: eventAt } }],
  };

  // Strictly newer, used only by the states that TAKE something away. Stripe's
  // `created` has one-second resolution and two events really do share a
  // second — `customer.subscription.created` (incomplete) and
  // `customer.subscription.updated` (active) routinely do. On a tie the live
  // one has to win, or arrival order decides whether a paying customer is
  // parked on PAST_DUE.
  const strictlyNewer: Prisma.SubscriptionWhereInput = {
    OR: [{ lastStripeEventAt: null }, { lastStripeEventAt: { lt: eventAt } }],
  };

  const tracksThisSubscription: Prisma.SubscriptionWhereInput = {
    OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId }],
  };
  const tracksAnotherSubscription: Prisma.SubscriptionWhereInput = {
    AND: [
      { stripeSubscriptionId: { not: null } },
      { stripeSubscriptionId: { not: stripeSubscriptionId } },
    ],
  };
  const rowIsNotLive: Prisma.SubscriptionWhereInput = {
    status: { notIn: ["ACTIVE", "TRIALING"] },
  };

  // Stripe gives up retrying a webhook after three days, so an event more than
  // four days behind what we have already recorded cannot be a late delivery
  // of something current. Without this bound, a takeover would accept the
  // redelivered opening event of a subscription that has long since ended.
  const withinRedeliveryWindow: Prisma.SubscriptionWhereInput = {
    OR: [
      { lastStripeEventAt: null },
      { lastStripeEventAt: { lte: new Date(eventAt.getTime() + TAKEOVER_LOOKBACK_MS) } },
    ],
  };

  const guard: Prisma.SubscriptionWhereInput = {
    userId,
    AND: isLiveStatus(status)
      ? [
          {
            OR: [
              // Our own stream: ordinary ordering.
              { AND: [tracksThisSubscription, notOlder] },
              // A different subscription, going live. The watermark belongs to
              // the other stream and says nothing about this one, so it only
              // arbitrates when there is another LIVE subscription to
              // arbitrate against.
              {
                AND: [
                  tracksAnotherSubscription,
                  { OR: [{ AND: [rowIsNotLive, withinRedeliveryWindow] }, notOlder] },
                ],
              },
            ],
          },
        ]
      : // Nothing that takes a plan away may touch a subscription this account
        // no longer tracks, and it must be strictly newer than what we have.
        [tracksThisSubscription, strictlyNewer],
  };

  // One conditional UPDATE. It is run at most twice, and the reason is the
  // whole difficulty of this function: a zero row count means EITHER the guard
  // refused OR this account simply has no row yet, and no amount of reading
  // afterwards can tell those apart — a concurrent delivery can create the row
  // in the gap between the update and the read, which looks exactly like a
  // guard refusal and would report a perfectly good event as stale.
  //
  // So the verdict is only ever taken from an update that ran against a row we
  // already know exists.
  const write = async (): Promise<number | "conflict"> => {
    try {
      const { count } = await prisma.subscription.updateMany({ where: guard, data: state });
      return count;
    } catch (error: unknown) {
      // userId is not among the columns being written, so the only unique
      // constraint this statement can break is a Stripe id that another
      // account's row already holds.
      if (isUniqueViolation(error)) return "conflict";
      throw error;
    }
  };

  const first = await write();
  if (first === "conflict") return "conflict";
  if (first > 0) return "applied";

  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true },
  });

  if (!existing) {
    try {
      await prisma.subscription.create({ data: { userId, ...state } });
      return "applied";
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      // Either another delivery created this account's row while we were
      // deciding to, or a Stripe id in this state belongs to a different
      // account. The second write below tells us which, by trying.
    }
  }

  // A row is now known to be there: we either read it, or failed to create one
  // because it appeared. A zero from THIS update is the guard genuinely
  // refusing.
  const second = await write();
  if (second === "conflict") return "conflict";
  if (second > 0) return "applied";

  const row = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true },
  });
  // No row of our own even now — so the create clashed on a Stripe id held
  // elsewhere, not on a race with ourselves.
  if (!row) return "conflict";

  return !isLiveStatus(status) && row.stripeSubscriptionId !== stripeSubscriptionId
    ? "superseded"
    : "stale";
}

/** Whether an error is a unique-constraint violation, whatever it was on. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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

/**
 * Points FreelancerProfile.searchBoost at "this account has an active Pro
 * subscription", which is the first term candidate search sorts on.
 *
 * The column is denormalized because the ranking query cannot afford a join
 * through User -> Subscription on every search, and the schema names the
 * Stripe webhook as its single writer. It had no writer at all until now: the
 * seed set it, account deletion cleared it, and nothing in between — so for
 * every real user it was permanently false while the pricing page sold
 * "search boost" and the recruiter UI said "Pro members appear first".
 *
 * Three properties worth keeping if this is ever rewritten:
 *
 *   Idempotent   The WHERE carries the value being written, so a redelivered
 *                webhook matches no rows and writes nothing. The conditional
 *                update IS the lock, as elsewhere in this file.
 *
 *   Role-safe    A recruiter's account has no FreelancerProfile, so a
 *                RECRUITER_GROWTH subscription matches nothing rather than
 *                needing a role check here.
 *
 *   Erasure-safe A deleted account is excluded, so a redelivered Pro event
 *                arriving after anonymisation cannot flip a field back on a
 *                profile that has been erased.
 *
 * Returns whether a row actually changed, which is what the caller logs.
 */
export async function syncFreelancerSearchBoost(
  userId: string,
  boosted: boolean,
): Promise<boolean> {
  const { count } = await prisma.freelancerProfile.updateMany({
    where: { userId, searchBoost: { not: boosted }, user: { deletedAt: null } },
    data: { searchBoost: boosted },
  });
  return count > 0;
}
