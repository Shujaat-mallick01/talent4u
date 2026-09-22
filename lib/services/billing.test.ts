import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  customerCreate: vi.fn(),
  portalCreate: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  configured: vi.fn(() => true),
  productId: vi.fn(() => null as string | null),
  planForProduct: vi.fn(() => null as string | null),
}));

const betaMock = vi.hoisted(() => ({
  freeAccess: false,
}));

vi.mock("@/lib/pricing/beta", () => ({
  get BETA_FREE_ACCESS() {
    return betaMock.freeAccess;
  },
  BETA_NOTE: "Free while in beta",
  effectivePlanForBeta: (_role: unknown, actual: string) => actual,
}));

vi.mock("@/lib/billing/stripe", () => ({
  stripeConfigured: stripeMocks.configured,
  stripeProductId: stripeMocks.productId,
  planForStripeProduct: stripeMocks.planForProduct,
  webhookSecret: () => "whsec_test",
  getStripe: () => ({
    checkout: { sessions: { create: stripeMocks.checkoutCreate } },
    customers: { create: stripeMocks.customerCreate },
    billingPortal: { sessions: { create: stripeMocks.portalCreate } },
    subscriptions: { retrieve: stripeMocks.subscriptionRetrieve },
  }),
}));

vi.mock("@/lib/db/subscription", () => ({
  getBillingState: vi.fn(),
  linkStripeCustomer: vi.fn(),
  findUserIdByStripeCustomer: vi.fn(),
  applySubscriptionState: vi.fn(),
  syncFreelancerSearchBoost: vi.fn(),
  setBillingCountryFromStripe: vi.fn(),
  userExists: vi.fn(),
}));

import {
  applySubscriptionState,
  findUserIdByStripeCustomer,
  syncFreelancerSearchBoost,
  getBillingState,
  linkStripeCustomer,
  setBillingCountryFromStripe,
  userExists,
} from "@/lib/db/subscription";

import { applyStripeEvent, getBillingView, openBillingPortal, startCheckout } from "./billing";

/**
 * The I/O half of billing. Everything the pure layer already proves is left to
 * subscription-state.test.ts; what is checked here is the part that decides
 * whether a charge happens and whose plan moves.
 */

const mockState = vi.mocked(getBillingState);
const mockApply = vi.mocked(applySubscriptionState);
const mockByCustomer = vi.mocked(findUserIdByStripeCustomer);
const mockExists = vi.mocked(userExists);
const mockBoost = vi.mocked(syncFreelancerSearchBoost);

const USER = "00000000-0000-4000-8000-000000000001";

const account = (over: Partial<Awaited<ReturnType<typeof getBillingState>>> = {}) =>
  ({
    userId: USER,
    role: "FREELANCER" as const,
    email: "a@example.com",
    billingCountry: "PK",
    isBanned: false,
    subscription: null,
    ...over,
  }) as NonNullable<Awaited<ReturnType<typeof getBillingState>>>;

type StoredSub = NonNullable<Awaited<ReturnType<typeof getBillingState>>>["subscription"];

const sub = (over: Partial<NonNullable<StoredSub>> = {}): StoredSub => ({
  plan: "FREELANCER_PRO",
  status: "ACTIVE",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  priceRegion: "LOW",
  // Relative, not absolute. getBillingView reads the real clock
  // (lib/services/billing.ts:160 nulls a period end that is in the past), so a
  // hardcoded date here is a time bomb: this fixture was "2026-09-01" and the
  // suite went red on its own on that date, with nothing having changed.
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  cancelAtPeriodEnd: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  stripeMocks.configured.mockReturnValue(true);
  stripeMocks.productId.mockReturnValue(null);
  stripeMocks.planForProduct.mockReturnValue(null);
  stripeMocks.customerCreate.mockResolvedValue({ id: "cus_new" });
  stripeMocks.checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
  stripeMocks.portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/x" });
  mockApply.mockResolvedValue("applied");
  mockExists.mockResolvedValue(true);
});

describe("startCheckout", () => {
  it("refuses a plan the role cannot buy, without calling Stripe", async () => {
    mockState.mockResolvedValue(account({ role: "FREELANCER" }));
    const result = await startCheckout(USER, "RECRUITER_TEAM");
    expect(result).toEqual({ ok: false, reason: "not-purchasable" });
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("refuses an admin any plan", async () => {
    mockState.mockResolvedValue(account({ role: "ADMIN" }));
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: false,
      reason: "not-purchasable",
    });
  });

  it("refuses a second subscription to the plan they already pay for", async () => {
    mockState.mockResolvedValue(account({ subscription: sub() }));
    // Checkout would create a SECOND subscription and bill them twice.
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: false,
      reason: "already-on-plan",
    });
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("sends a lapsed subscriber to the portal, not to a second checkout", async () => {
    mockState.mockResolvedValue(
      account({ subscription: sub({ status: "PAST_DUE", currentPeriodEnd: null }) }),
    );
    // Stripe has NOT given up on this subscription — past_due means it is still
    // retrying the card. A fresh checkout would leave the account holding two
    // subscriptions and billing both the moment the card recovers. This test
    // previously asserted the opposite, which is how the bug got in.
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: false,
      reason: "manage-in-portal",
    });
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("sends an upgrade to the portal, where Stripe prorates it", async () => {
    mockState.mockResolvedValue(
      account({ role: "RECRUITER", subscription: sub({ plan: "RECRUITER_GROWTH" }) }),
    );
    expect(await startCheckout(USER, "RECRUITER_TEAM")).toEqual({
      ok: false,
      reason: "manage-in-portal",
    });
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("refuses checkout when beta free access is enabled", async () => {
    betaMock.freeAccess = true;
    try {
      expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
        ok: false,
        reason: "beta-free",
      });
    } finally {
      betaMock.freeAccess = false;
    }
  });

  it("allows checkout again once the subscription is genuinely cancelled", async () => {
    mockState.mockResolvedValue(
      account({ subscription: sub({ plan: "FREE", status: "CANCELED", currentPeriodEnd: null }) }),
    );
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: true,
      url: "https://checkout.stripe.com/x",
    });
  });

  it("allows the first checkout when only a customer id has been recorded", async () => {
    // linkStripeCustomer writes exactly this row when checkout opens. It is a
    // customer, not a subscription, and must not lock anyone out of buying.
    mockState.mockResolvedValue(
      account({
        subscription: sub({ plan: "FREE", stripeSubscriptionId: null, currentPeriodEnd: null }),
      }),
    );
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: true,
      url: "https://checkout.stripe.com/x",
    });
  });

  it("refuses a removed employer rather than billing them monthly for nothing", async () => {
    // Every publish, message and search this would buy is already refused by
    // the moderation layer. Taking $249 a month for it is the worst possible
    // combination of "the UI allowed it" and "the product does not work".
    mockState.mockResolvedValue(account({ role: "RECRUITER", isBanned: true }));
    expect(await startCheckout(USER, "RECRUITER_GROWTH")).toEqual({
      ok: false,
      reason: "account-removed",
    });
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("lets someone whose first payment was declined try again", async () => {
    // Stripe leaves a declined first payment as `incomplete`, which maps to
    // CANCELED. Nothing was ever paid, so there is nothing to manage in a
    // portal — refusing checkout here locked people out over a typo'd card.
    mockState.mockResolvedValue(
      account({ subscription: sub({ status: "CANCELED", currentPeriodEnd: null }) }),
    );
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: true,
      url: "https://checkout.stripe.com/x",
    });
  });

  it("lets a grace-expired account start paying again", async () => {
    // The row still says ACTIVE, but its period ended long ago and Stripe has
    // told us nothing since — so the entitlement is already gone. If checkout
    // stayed shut, this account could never pay us again: the portal has
    // nothing in it to switch, and no webhook is ever coming.
    mockState.mockResolvedValue(
      account({
        subscription: sub({
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        }),
      }),
    );
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: true,
      url: "https://checkout.stripe.com/x",
    });
  });

  it("expires the session in well under Stripe's 24-hour default", async () => {
    // A session stays payable for a day by default, and the gate can only see
    // what a webhook has written. That is how two sessions opened minutes
    // apart both get paid and the customer ends up with two subscriptions.
    mockState.mockResolvedValue(account());
    await startCheckout(USER, "FREELANCER_PRO");
    const args = stripeMocks.checkoutCreate.mock.calls[0][0];
    const minutes = (args.expires_at - Math.floor(Date.now() / 1000)) / 60;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it("charges the band for the billing country, not the list price", async () => {
    mockState.mockResolvedValue(account({ billingCountry: "PK" }));
    await startCheckout(USER, "FREELANCER_PRO");

    const args = stripeMocks.checkoutCreate.mock.calls[0][0];
    // PK is the LOW band: $3, not the $6 list price.
    expect(args.line_items[0].price_data.unit_amount).toBe(300);
    expect(args.line_items[0].price_data.currency).toBe("usd");
    expect(args.line_items[0].price_data.recurring.interval).toBe("month");
  });

  it("falls back to the list price when no country is set", async () => {
    mockState.mockResolvedValue(account({ billingCountry: null }));
    await startCheckout(USER, "FREELANCER_PRO");
    expect(stripeMocks.checkoutCreate.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(
      600,
    );
  });

  it("writes the plan and account onto the SUBSCRIPTION, which webhooks read", async () => {
    mockState.mockResolvedValue(account());
    await startCheckout(USER, "FREELANCER_PRO");

    const args = stripeMocks.checkoutCreate.mock.calls[0][0];
    expect(args.subscription_data.metadata).toEqual({
      userId: USER,
      plan: "FREELANCER_PRO",
      band: "LOW",
    });
    // Collected so the band has evidence behind it.
    expect(args.billing_address_collection).toBe("required");
    expect(args.mode).toBe("subscription");
  });

  it("reuses an existing Stripe customer instead of creating a duplicate", async () => {
    mockState.mockResolvedValue(
      account({
        subscription: {
          plan: "FREE",
          status: "ACTIVE",
          stripeCustomerId: "cus_existing",
          stripeSubscriptionId: null,
          priceRegion: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      }),
    );
    await startCheckout(USER, "FREELANCER_PRO");
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate.mock.calls[0][0].customer).toBe("cus_existing");
  });

  it("creates and records a customer on the first checkout", async () => {
    mockState.mockResolvedValue(account());
    await startCheckout(USER, "FREELANCER_PRO");
    expect(linkStripeCustomer).toHaveBeenCalledWith(USER, "cus_new");
  });

  it("reports unavailable rather than throwing when Stripe is not configured", async () => {
    stripeMocks.configured.mockReturnValue(false);
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(mockState).not.toHaveBeenCalled();
  });

  it("does not leak a Stripe failure as a crash", async () => {
    mockState.mockResolvedValue(account());
    stripeMocks.checkoutCreate.mockRejectedValue(new Error("card_declined"));
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: false,
      reason: "stripe-error",
    });
  });
});

describe("openBillingPortal", () => {
  it("refuses when the account has never been charged", async () => {
    mockState.mockResolvedValue(account());
    expect(await openBillingPortal(USER)).toEqual({ ok: false, reason: "no-customer" });
    // Creating a customer here would produce an empty portal that looks broken.
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
  });

  it("opens the portal for a customer", async () => {
    mockState.mockResolvedValue(
      account({
        subscription: {
          plan: "FREELANCER_PRO",
          status: "ACTIVE",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          priceRegion: "LOW",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      }),
    );
    expect(await openBillingPortal(USER)).toEqual({
      ok: true,
      url: "https://billing.stripe.com/x",
    });
  });
});

// ── Webhooks ───────────────────────────────────────────────────────────────

const EVENT_AT = 1_800_000_000;

const stripeSub = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  status: "active",
  cancel_at_period_end: false,
  customer: "cus_1",
  metadata: { plan: "FREELANCER_PRO", band: "LOW", userId: USER },
  items: { data: [{ current_period_end: EVENT_AT + 2_592_000 }] },
  ...over,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow Stripe.Event fixtures
const event = (type: string, object: unknown): any => ({
  id: "evt_1",
  type,
  created: EVENT_AT,
  data: { object },
});

describe("applyStripeEvent", () => {
  it("applies a created subscription to the account named in metadata", async () => {
    const result = await applyStripeEvent(event("customer.subscription.created", stripeSub()));
    expect(result.handled).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        plan: "FREELANCER_PRO",
        status: "ACTIVE",
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        priceRegion: "LOW",
        eventAt: new Date(EVENT_AT * 1000),
      }),
    );
  });

  it("drops a subscription to FREE when Stripe deletes it", async () => {
    await applyStripeEvent(event("customer.subscription.deleted", stripeSub()));
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "FREE", status: "CANCELED", currentPeriodEnd: null }),
    );
  });

  it("refuses a subscription with no plan metadata rather than guessing one", async () => {
    const result = await applyStripeEvent(
      event("customer.subscription.updated", stripeSub({ metadata: {} })),
    );
    expect(result.handled).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("falls back to the recorded customer when metadata carries no account", async () => {
    mockByCustomer.mockResolvedValue(USER);
    await applyStripeEvent(
      event("customer.subscription.updated", stripeSub({ metadata: { plan: "FREELANCER_PRO" } })),
    );
    expect(mockByCustomer).toHaveBeenCalledWith("cus_1");
    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }));
  });

  it("ignores a metadata id whose account no longer exists", async () => {
    // Otherwise the upsert fails its foreign key and Stripe retries the same
    // 500 for three days.
    mockExists.mockResolvedValue(false);
    mockByCustomer.mockResolvedValue(null);
    const result = await applyStripeEvent(event("customer.subscription.updated", stripeSub()));
    expect(result.handled).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("reports a subscription already held by a different account", async () => {
    mockApply.mockResolvedValue("conflict");
    const result = await applyStripeEvent(event("customer.subscription.updated", stripeSub()));
    expect(result.handled).toBe(false);
  });

  it("acknowledges a stale event without treating it as a failure", async () => {
    mockApply.mockResolvedValue("stale");
    const result = await applyStripeEvent(event("customer.subscription.updated", stripeSub()));
    expect(result.handled).toBe(true);
  });

  it("acknowledges a delete for a subscription an upgrade already replaced", async () => {
    // Stripe cancels the old subscription AFTER the new one goes live, so this
    // event arrives last and names a subscription the account no longer holds.
    // Applying it would cancel the plan the customer just paid for; the db
    // layer refuses and the webhook must still answer 200 so Stripe stops.
    mockApply.mockResolvedValue("superseded");
    const result = await applyStripeEvent(event("customer.subscription.deleted", stripeSub()));
    expect(result.handled).toBe(true);
    expect(result.detail).toContain("not the subscription this account tracks");
  });

  it("fetches the subscription on a completed checkout, so order does not matter", async () => {
    stripeMocks.subscriptionRetrieve.mockResolvedValue(stripeSub());
    const result = await applyStripeEvent(
      event("checkout.session.completed", {
        metadata: { userId: USER, plan: "FREELANCER_PRO" },
        customer: "cus_1",
        subscription: "sub_1",
        customer_details: { address: { country: "pk" } },
      }),
    );
    expect(stripeMocks.subscriptionRetrieve).toHaveBeenCalledWith("sub_1");
    expect(result.handled).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ plan: "FREELANCER_PRO" }));
  });

  it("writes back the country Stripe verified against the card", async () => {
    stripeMocks.subscriptionRetrieve.mockResolvedValue(stripeSub());
    await applyStripeEvent(
      event("checkout.session.completed", {
        metadata: { userId: USER },
        customer: "cus_1",
        subscription: "sub_1",
        customer_details: { address: { country: "DE" } },
      }),
    );
    expect(setBillingCountryFromStripe).toHaveBeenCalledWith(USER, "DE");
  });

  it("does not lapse a plan on the first failed payment", async () => {
    // Stripe retries for days before deciding; it says past_due itself with a
    // subscription.updated. Acting early cuts off a customer mid-retry.
    mockByCustomer.mockResolvedValue(USER);
    const result = await applyStripeEvent(
      event("invoice.payment_failed", { customer: "cus_1", id: "in_1" }),
    );
    expect(result.handled).toBe(true);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("reads a portal plan switch off the product, not off stale metadata", async () => {
    // Stripe swaps a subscription's items in place when someone changes plan
    // in the customer portal and never touches metadata, so metadata names
    // whatever they FIRST bought, forever. Since checkout now sends every plan
    // change to that portal, trusting metadata would mean nobody can ever
    // actually change plan — they would pay the new price on the old tier.
    stripeMocks.planForProduct.mockReturnValue("RECRUITER_TEAM");
    await applyStripeEvent(
      event(
        "customer.subscription.updated",
        stripeSub({
          metadata: { plan: "RECRUITER_GROWTH", band: "STANDARD", userId: USER },
          items: { data: [{ current_period_end: 1800000000, price: { product: "prod_team" } }] },
        }),
      ),
    );
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "RECRUITER_TEAM" }),
    );
  });

  it("acknowledges event types it does not model", async () => {
    const result = await applyStripeEvent(event("customer.updated", { id: "cus_1" }));
    expect(result.handled).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("getBillingView", () => {
  it("reports the ENTITLED plan, not the plan that was bought", async () => {
    mockState.mockResolvedValue(
      account({
        subscription: {
          plan: "FREELANCER_PRO",
          status: "PAST_DUE",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          priceRegion: "LOW",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
      }),
    );
    const view = await getBillingView(USER);
    // A page saying "Pro" while the product enforces free limits is a support
    // ticket waiting to happen.
    expect(view?.plan).toBe("FREE");
    expect(view?.status).toBe("PAST_DUE");
  });

  it("prices the options in the viewer's band", async () => {
    mockState.mockResolvedValue(account({ billingCountry: "PK" }));
    const view = await getBillingView(USER);
    expect(view?.band).toBe("LOW");
    expect(view?.options).toHaveLength(1);
    expect(view?.options[0]).toMatchObject({
      plan: "FREELANCER_PRO",
      monthly: "$3/mo",
      listMonthly: "$6/mo",
      isReduced: true,
    });
  });

  it("offers an admin nothing to buy", async () => {
    mockState.mockResolvedValue(account({ role: "ADMIN" }));
    expect((await getBillingView(USER))?.options).toEqual([]);
  });

  it("marks the plan they are on as current", async () => {
    mockState.mockResolvedValue(
      account({
        subscription: {
          plan: "FREELANCER_PRO",
          status: "ACTIVE",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          priceRegion: "LOW",
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: false,
        },
      }),
    );
    const view = await getBillingView(USER);
    expect(view?.options[0].current).toBe(true);
    expect(view?.hasBillingAccount).toBe(true);
  });

  it("stops offering checkout once a subscription exists with Stripe", async () => {
    mockState.mockResolvedValue(account({ role: "RECRUITER", subscription: sub({ plan: "RECRUITER_GROWTH" }) }));
    const view = await getBillingView(USER);
    // The Team card must not render a checkout button; the portal is the only
    // way to change a subscription that already exists.
    expect(view?.canCheckout).toBe(false);
  });

  it("offers checkout to an account with no subscription at all", async () => {
    mockState.mockResolvedValue(account({ subscription: null }));
    expect((await getBillingView(USER))?.canCheckout).toBe(true);
  });

  it("offers checkout again after a genuine cancellation", async () => {
    mockState.mockResolvedValue(
      account({ subscription: sub({ plan: "FREE", status: "CANCELED", currentPeriodEnd: null }) }),
    );
    expect((await getBillingView(USER))?.canCheckout).toBe(true);
  });

  it("marks a lapsed plan as on hold, so nobody buys it a second time", async () => {
    mockState.mockResolvedValue(
      account({ subscription: sub({ status: "PAST_DUE", currentPeriodEnd: null }) }),
    );
    const view = await getBillingView(USER);
    const pro = view?.options.find((o) => o.plan === "FREELANCER_PRO");
    expect(pro?.current).toBe(false);
    expect(pro?.onHold).toBe(true);
  });

  it("does not mark a plan on hold when nothing was ever bought", async () => {
    mockState.mockResolvedValue(account({ subscription: null }));
    expect((await getBillingView(USER))?.options.every((o) => !o.onHold)).toBe(true);
  });

  it("reopens checkout for a grace-expired subscription, and says why", async () => {
    mockState.mockResolvedValue(
      account({
        subscription: sub({
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        }),
      }),
    );
    const view = await getBillingView(USER);
    expect(view?.plan).toBe("FREE");
    expect(view?.graceExpired).toBe(true);
    expect(view?.canCheckout).toBe(true);
    // A period end in the past is not a renewal date.
    expect(view?.currentPeriodEnd).toBeNull();
  });

  it("offers a removed employer nothing to buy", async () => {
    mockState.mockResolvedValue(account({ role: "RECRUITER", isBanned: true }));
    expect((await getBillingView(USER))?.canCheckout).toBe(false);
  });

  it("does not call a live subscription grace-expired", async () => {
    mockState.mockResolvedValue(account({ subscription: sub() }));
    const view = await getBillingView(USER);
    expect(view?.graceExpired).toBe(false);
    expect(view?.currentPeriodEnd).not.toBeNull();
  });

  it("drops a plan whose period ended long ago and was never renewed", async () => {
    mockState.mockResolvedValue(
      account({
        // ACTIVE, but Stripe stopped telling us anything two months ago. The
        // likeliest cause is a webhook we never received, and a paid plan must
        // not outlive the events that keep it alive.
        subscription: sub({ status: "ACTIVE", currentPeriodEnd: new Date("2020-01-01T00:00:00Z") }),
      }),
    );
    const view = await getBillingView(USER);
    expect(view?.plan).toBe("FREE");
  });
});

describe("the Pro search boost follows the subscription", () => {
  // searchBoost is the first term candidate search sorts on, and it had no
  // writer at all: the seed set it, account deletion cleared it, nothing in
  // between. So "Pro members appear first" was sold and never delivered.
  it("turns the boost on when a Pro subscription goes live", async () => {
    await applyStripeEvent(event("customer.subscription.created", stripeSub()));
    expect(mockBoost).toHaveBeenCalledWith(USER, true);
  });

  it("turns it off when the subscription is deleted", async () => {
    await applyStripeEvent(event("customer.subscription.deleted", stripeSub()));
    expect(mockBoost).toHaveBeenCalledWith(USER, false);
  });

  it("turns it off the moment a plan lapses, not when the period ends", async () => {
    // A PAST_DUE row still names FREELANCER_PRO. Reading state.plan here would
    // keep a lapsed member outranking people who are paying.
    await applyStripeEvent(
      event("customer.subscription.updated", stripeSub({ status: "past_due" })),
    );
    expect(mockBoost).toHaveBeenCalledWith(USER, false);
  });

  it("never boosts a recruiter plan", async () => {
    stripeMocks.planForProduct.mockReturnValue("RECRUITER_GROWTH");
    await applyStripeEvent(
      event("customer.subscription.created", stripeSub({ metadata: { userId: USER, plan: "RECRUITER_GROWTH" } })),
    );
    expect(mockBoost).toHaveBeenCalledWith(USER, false);
  });

  it("does not rewrite ranking from an event that was not applied", async () => {
    for (const outcome of ["stale", "superseded", "conflict"] as const) {
      mockBoost.mockClear();
      mockApply.mockResolvedValue(outcome);
      await applyStripeEvent(event("customer.subscription.updated", stripeSub()));
      expect(mockBoost, `${outcome} must not touch searchBoost`).not.toHaveBeenCalled();
    }
  });
});
