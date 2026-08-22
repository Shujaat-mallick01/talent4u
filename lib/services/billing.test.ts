import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  customerCreate: vi.fn(),
  portalCreate: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  configured: vi.fn(() => true),
  productId: vi.fn(() => null as string | null),
}));

vi.mock("@/lib/billing/stripe", () => ({
  stripeConfigured: stripeMocks.configured,
  stripeProductId: stripeMocks.productId,
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
  setBillingCountryFromStripe: vi.fn(),
  userExists: vi.fn(),
}));

import {
  applySubscriptionState,
  findUserIdByStripeCustomer,
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

const USER = "00000000-0000-4000-8000-000000000001";

const account = (over: Partial<Awaited<ReturnType<typeof getBillingState>>> = {}) =>
  ({
    userId: USER,
    role: "FREELANCER" as const,
    email: "a@example.com",
    billingCountry: "PK",
    subscription: null,
    ...over,
  }) as NonNullable<Awaited<ReturnType<typeof getBillingState>>>;

beforeEach(() => {
  vi.clearAllMocks();
  stripeMocks.configured.mockReturnValue(true);
  stripeMocks.productId.mockReturnValue(null);
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
    // Checkout would create a SECOND subscription and bill them twice.
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: false,
      reason: "already-on-plan",
    });
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("allows re-subscribing when the current one has lapsed", async () => {
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
    expect(await startCheckout(USER, "FREELANCER_PRO")).toEqual({
      ok: true,
      url: "https://checkout.stripe.com/x",
    });
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
});
