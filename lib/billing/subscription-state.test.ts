import { describe, expect, it } from "vitest";

import {
  canPurchase,
  cancelledState,
  parsePlanMetadata,
  planAudience,
  purchasablePlans,
  subscriptionStateFrom,
  toSubscriptionStatus,
  type StripeSubscriptionShape,
} from "./subscription-state";

/**
 * The money rules. Every one of these is a decision that, if wrong, either
 * gives a paid plan away or takes a paid plan from someone who paid for it —
 * so the fixtures deliberately include the malformed events a real webhook
 * delivers, not only the happy ones.
 */

describe("purchasablePlans", () => {
  it("offers a freelancer only the freelancer plan", () => {
    expect(purchasablePlans("FREELANCER")).toEqual(["FREELANCER_PRO"]);
  });

  it("offers a recruiter both recruiter plans", () => {
    expect(purchasablePlans("RECRUITER")).toEqual(["RECRUITER_GROWTH", "RECRUITER_TEAM"]);
  });

  it("offers an admin nothing — staff are not customers", () => {
    expect(purchasablePlans("ADMIN")).toEqual([]);
  });

  it("offers a logged-out visitor nothing", () => {
    expect(purchasablePlans(null)).toEqual([]);
  });

  it("never offers FREE, which is not something anyone buys", () => {
    for (const role of ["FREELANCER", "RECRUITER", "ADMIN"] as const) {
      expect(purchasablePlans(role)).not.toContain("FREE");
    }
  });
});

describe("canPurchase", () => {
  it("refuses a freelancer buying a recruiter plan", () => {
    expect(canPurchase("FREELANCER", "RECRUITER_GROWTH")).toBe(false);
    expect(canPurchase("FREELANCER", "RECRUITER_TEAM")).toBe(false);
  });

  it("refuses a recruiter buying the freelancer plan", () => {
    expect(canPurchase("RECRUITER", "FREELANCER_PRO")).toBe(false);
  });

  it("refuses everyone the free plan", () => {
    expect(canPurchase("FREELANCER", "FREE")).toBe(false);
    expect(canPurchase("RECRUITER", "FREE")).toBe(false);
  });

  it("allows each role its own plans", () => {
    expect(canPurchase("FREELANCER", "FREELANCER_PRO")).toBe(true);
    expect(canPurchase("RECRUITER", "RECRUITER_GROWTH")).toBe(true);
    expect(canPurchase("RECRUITER", "RECRUITER_TEAM")).toBe(true);
  });
});

describe("planAudience", () => {
  it("maps each paid plan to its role and FREE to neither", () => {
    expect(planAudience("FREELANCER_PRO")).toBe("FREELANCER");
    expect(planAudience("RECRUITER_GROWTH")).toBe("RECRUITER");
    expect(planAudience("RECRUITER_TEAM")).toBe("RECRUITER");
    expect(planAudience("FREE")).toBeNull();
  });
});

describe("toSubscriptionStatus", () => {
  it("treats only active and trialing as live", () => {
    expect(toSubscriptionStatus("active")).toBe("ACTIVE");
    expect(toSubscriptionStatus("trialing")).toBe("TRIALING");
  });

  it("does NOT treat an incomplete first payment as active", () => {
    // Someone who opens checkout and abandons it at the card form has an
    // `incomplete` subscription. Reading that as ACTIVE hands out a paid plan
    // to anyone who clicks the button.
    expect(toSubscriptionStatus("incomplete")).toBe("PAST_DUE");
  });

  it("treats unpaid and paused as not-being-paid", () => {
    expect(toSubscriptionStatus("unpaid")).toBe("PAST_DUE");
    expect(toSubscriptionStatus("paused")).toBe("PAST_DUE");
    expect(toSubscriptionStatus("past_due")).toBe("PAST_DUE");
  });

  it("treats a subscription that never started as cancelled", () => {
    expect(toSubscriptionStatus("canceled")).toBe("CANCELED");
    expect(toSubscriptionStatus("incomplete_expired")).toBe("CANCELED");
  });

  it("fails closed on a status Stripe adds later", () => {
    expect(toSubscriptionStatus("some_future_status")).toBe("PAST_DUE");
    expect(toSubscriptionStatus("")).toBe("PAST_DUE");
  });
});

describe("parsePlanMetadata", () => {
  it("accepts the paid plans, case-insensitively", () => {
    expect(parsePlanMetadata("FREELANCER_PRO")).toBe("FREELANCER_PRO");
    expect(parsePlanMetadata("recruiter_growth")).toBe("RECRUITER_GROWTH");
    expect(parsePlanMetadata(" RECRUITER_TEAM ")).toBe("RECRUITER_TEAM");
  });

  it("refuses FREE, junk, and non-strings", () => {
    expect(parsePlanMetadata("FREE")).toBeNull();
    expect(parsePlanMetadata("ENTERPRISE")).toBeNull();
    expect(parsePlanMetadata(undefined)).toBeNull();
    expect(parsePlanMetadata(null)).toBeNull();
    expect(parsePlanMetadata(42)).toBeNull();
    expect(parsePlanMetadata({ plan: "FREELANCER_PRO" })).toBeNull();
  });
});

const PERIOD_END = 1_800_000_000; // seconds

const sub = (over: Partial<StripeSubscriptionShape> = {}): StripeSubscriptionShape => ({
  id: "sub_123",
  status: "active",
  cancel_at_period_end: false,
  metadata: { plan: "FREELANCER_PRO", band: "LOW", userId: "u1" },
  items: { data: [{ current_period_end: PERIOD_END }] },
  ...over,
});

describe("subscriptionStateFrom", () => {
  it("maps a live subscription", () => {
    expect(subscriptionStateFrom(sub())).toEqual({
      stripeSubscriptionId: "sub_123",
      plan: "FREELANCER_PRO",
      status: "ACTIVE",
      currentPeriodEnd: new Date(PERIOD_END * 1000),
      cancelAtPeriodEnd: false,
      priceRegion: "LOW",
    });
  });

  it("reads the period end off the ITEM, where the 2026 API moved it", () => {
    // The subscription object no longer carries current_period_end at all. A
    // reader that looks for it there silently produces null forever.
    const state = subscriptionStateFrom(sub());
    expect(state?.currentPeriodEnd).toEqual(new Date(PERIOD_END * 1000));
  });

  it("refuses a subscription with no plan metadata rather than guessing", () => {
    expect(subscriptionStateFrom(sub({ metadata: {} }))).toBeNull();
    expect(subscriptionStateFrom(sub({ metadata: null }))).toBeNull();
    expect(subscriptionStateFrom(sub({ metadata: { plan: "FREE" } }))).toBeNull();
  });

  it("treats a missing or nonsense period end as unknown, not epoch zero", () => {
    expect(subscriptionStateFrom(sub({ items: { data: [] } }))?.currentPeriodEnd).toBeNull();
    expect(subscriptionStateFrom(sub({ items: null }))?.currentPeriodEnd).toBeNull();
    expect(
      subscriptionStateFrom(sub({ items: { data: [{ current_period_end: 0 }] } }))
        ?.currentPeriodEnd,
    ).toBeNull();
  });

  it("carries cancel_at_period_end through", () => {
    expect(subscriptionStateFrom(sub({ cancel_at_period_end: true }))?.cancelAtPeriodEnd).toBe(
      true,
    );
    // Absent is false, never "truthy-ish".
    expect(subscriptionStateFrom(sub({ cancel_at_period_end: null }))?.cancelAtPeriodEnd).toBe(
      false,
    );
  });

  it("records the band that was actually charged", () => {
    expect(subscriptionStateFrom(sub())?.priceRegion).toBe("LOW");
    expect(
      subscriptionStateFrom(sub({ metadata: { plan: "FREELANCER_PRO" } }))?.priceRegion,
    ).toBeNull();
  });

  it("does not grant entitlements for a past_due subscription", () => {
    expect(subscriptionStateFrom(sub({ status: "past_due" }))?.status).toBe("PAST_DUE");
  });
});

describe("cancelledState", () => {
  it("drops to FREE and clears the period", () => {
    expect(cancelledState("sub_9")).toEqual({
      stripeSubscriptionId: "sub_9",
      plan: "FREE",
      status: "CANCELED",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      priceRegion: null,
    });
  });
});
