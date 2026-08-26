import { describe, expect, it } from "vitest";

import {
  ENTITLEMENT_GRACE_DAYS,
  isGraceExpired,
  subscriptionBlocksCheckout,
  canPurchase,
  cancelledState,
  entitledPlanFrom,
  isLiveStatus,
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
    // CANCELED rather than PAST_DUE. Both give FREE entitlements, but only
    // CANCELED lets them try again — a declined card on a subscription nobody
    // has ever paid for must not lock the person out of buying one.
    expect(toSubscriptionStatus("incomplete")).toBe("CANCELED");
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

describe("isLiveStatus", () => {
  it("is true only for the two statuses that mean we are being paid", () => {
    expect(isLiveStatus("ACTIVE")).toBe(true);
    expect(isLiveStatus("TRIALING")).toBe(true);
    expect(isLiveStatus("PAST_DUE")).toBe(false);
    expect(isLiveStatus("CANCELED")).toBe(false);
  });
});

describe("entitledPlanFrom", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date("2026-08-26T12:00:00Z");
  const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * DAY);

  it("is FREE when there is no subscription at all", () => {
    expect(entitledPlanFrom(null, now)).toBe("FREE");
    expect(entitledPlanFrom(undefined, now)).toBe("FREE");
  });

  it("grants the plan on a live subscription", () => {
    expect(
      entitledPlanFrom({ plan: "RECRUITER_TEAM", status: "ACTIVE", currentPeriodEnd: at(5) }, now),
    ).toBe("RECRUITER_TEAM");
    expect(
      entitledPlanFrom(
        { plan: "FREELANCER_PRO", status: "TRIALING", currentPeriodEnd: at(5) },
        now,
      ),
    ).toBe("FREELANCER_PRO");
  });

  it("falls back to FREE the moment payment stops, without deleting the plan", () => {
    for (const status of ["PAST_DUE", "CANCELED"] as const) {
      expect(
        entitledPlanFrom({ plan: "RECRUITER_TEAM", status, currentPeriodEnd: at(5) }, now),
      ).toBe("FREE");
    }
  });

  it("keeps granting inside the grace window, so a late webhook cannot cut anyone off", () => {
    // The renewal event has not arrived yet. Stripe retries for three days;
    // this window is longer than that on purpose.
    const justInside = at(-(ENTITLEMENT_GRACE_DAYS - 1));
    expect(
      entitledPlanFrom({ plan: "FREELANCER_PRO", status: "ACTIVE", currentPeriodEnd: justInside }, now),
    ).toBe("FREELANCER_PRO");
  });

  it("stops granting a plan whose period ended past the grace window", () => {
    // An ACTIVE row nobody has heard about in weeks means we lost the events
    // that would have ended it. Without this, one dropped `deleted` webhook
    // grants a paid plan forever.
    const wellOutside = at(-(ENTITLEMENT_GRACE_DAYS + 1));
    expect(
      entitledPlanFrom({ plan: "FREELANCER_PRO", status: "ACTIVE", currentPeriodEnd: wellOutside }, now),
    ).toBe("FREE");
  });

  it("treats an unknown period end as unknown, not as expired", () => {
    // A partial webhook object can leave this unset. Inventing an expiry from a
    // field we simply did not receive would cut off a paying customer.
    expect(
      entitledPlanFrom({ plan: "FREELANCER_PRO", status: "ACTIVE", currentPeriodEnd: null }, now),
    ).toBe("FREELANCER_PRO");
    expect(entitledPlanFrom({ plan: "FREELANCER_PRO", status: "ACTIVE" }, now)).toBe(
      "FREELANCER_PRO",
    );
  });

  it("never invents a plan a cancelled row still carries", () => {
    expect(
      entitledPlanFrom({ plan: "RECRUITER_TEAM", status: "CANCELED", currentPeriodEnd: null }, now),
    ).toBe("FREE");
  });
});

describe("subscriptionBlocksCheckout", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;
  const row = (over: Record<string, unknown> = {}) =>
    ({
      plan: "RECRUITER_GROWTH" as const,
      status: "ACTIVE" as const,
      currentPeriodEnd: new Date(now.getTime() + 5 * DAY),
      stripeSubscriptionId: "sub_1",
      ...over,
    }) as Parameters<typeof subscriptionBlocksCheckout>[0];

  it("blocks while a live subscription exists", () => {
    expect(subscriptionBlocksCheckout(row(), now)).toBe(true);
    expect(subscriptionBlocksCheckout(row({ status: "TRIALING" }), now)).toBe(true);
  });

  it("blocks a past-due subscription, because Stripe is still retrying it", () => {
    // A second checkout here bills them twice the moment the card recovers.
    expect(subscriptionBlocksCheckout(row({ status: "PAST_DUE" }), now)).toBe(true);
  });

  it("does not block when there is no subscription at all", () => {
    expect(subscriptionBlocksCheckout(null, now)).toBe(false);
    expect(subscriptionBlocksCheckout(undefined, now)).toBe(false);
  });

  it("does not block on a customer record with no subscription id", () => {
    // linkStripeCustomer writes exactly this row when checkout opens.
    expect(subscriptionBlocksCheckout(row({ stripeSubscriptionId: null }), now)).toBe(false);
  });

  it("does not block after a genuine cancellation", () => {
    expect(subscriptionBlocksCheckout(row({ status: "CANCELED" }), now)).toBe(false);
  });

  it("does not block a subscription Stripe stopped telling us about", () => {
    // The grace window has passed, so the entitlement is already gone. If the
    // gate still refused, this account could never start paying again: the
    // portal has nothing in it to switch, and no event is ever coming.
    const dead = row({ currentPeriodEnd: new Date(now.getTime() - (ENTITLEMENT_GRACE_DAYS + 1) * DAY) });
    expect(subscriptionBlocksCheckout(dead, now)).toBe(false);
  });

  it("still blocks inside the grace window", () => {
    const recent = row({
      currentPeriodEnd: new Date(now.getTime() - (ENTITLEMENT_GRACE_DAYS - 1) * DAY),
    });
    expect(subscriptionBlocksCheckout(recent, now)).toBe(true);
  });
});

describe("isGraceExpired", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;

  it("is false when the period end is unknown", () => {
    expect(isGraceExpired({ currentPeriodEnd: null }, now)).toBe(false);
    expect(isGraceExpired(null, now)).toBe(false);
  });

  it("is false inside the window and true outside it", () => {
    expect(
      isGraceExpired({ currentPeriodEnd: new Date(now.getTime() - (ENTITLEMENT_GRACE_DAYS - 1) * DAY) }, now),
    ).toBe(false);
    expect(
      isGraceExpired({ currentPeriodEnd: new Date(now.getTime() - (ENTITLEMENT_GRACE_DAYS + 1) * DAY) }, now),
    ).toBe(true);
  });
});

describe("subscriptionStateFrom — where the plan and the period come from", () => {
  const base = {
    id: "sub_1",
    status: "active",
    metadata: { plan: "RECRUITER_GROWTH", band: "STANDARD" },
  };

  it("prefers the product over metadata, because the portal only updates the product", () => {
    // The customer switched Growth -> Team in the Stripe portal. Stripe swapped
    // the item and left metadata naming Growth forever. Trusting metadata bills
    // them for Team and entitles them to Growth, permanently.
    const state = subscriptionStateFrom(base as StripeSubscriptionShape, "RECRUITER_TEAM");
    expect(state?.plan).toBe("RECRUITER_TEAM");
  });

  it("falls back to metadata when the product is not in the catalogue", () => {
    expect(subscriptionStateFrom(base as StripeSubscriptionShape, null)?.plan).toBe(
      "RECRUITER_GROWTH",
    );
    expect(subscriptionStateFrom(base as StripeSubscriptionShape)?.plan).toBe("RECRUITER_GROWTH");
  });

  it("reads current_period_end off the item, as the 2026 API sends it", () => {
    const state = subscriptionStateFrom({
      ...base,
      items: { data: [{ current_period_end: 1800000000 }] },
    } as StripeSubscriptionShape);
    expect(state?.currentPeriodEnd).toEqual(new Date(1800000000 * 1000));
  });

  it("falls back to the root field, for an endpoint pinned to an older version", () => {
    // The webhook payload is rendered at the version configured on the
    // ENDPOINT, not the version this client pins. Without this fallback the
    // period end is null on every event and the grace expiry never fires.
    const state = subscriptionStateFrom({
      ...base,
      current_period_end: 1800000000,
    } as StripeSubscriptionShape);
    expect(state?.currentPeriodEnd).toEqual(new Date(1800000000 * 1000));
  });

  it("prefers the item over the root when both are present", () => {
    const state = subscriptionStateFrom({
      ...base,
      items: { data: [{ current_period_end: 1800000000 }] },
      current_period_end: 1700000000,
    } as StripeSubscriptionShape);
    expect(state?.currentPeriodEnd).toEqual(new Date(1800000000 * 1000));
  });
});
