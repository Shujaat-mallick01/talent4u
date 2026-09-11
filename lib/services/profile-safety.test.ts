import { describe, expect, it } from "vitest";

import { safetyReasonPhrase, scanProfileProse } from "./profile-safety";

const clean = "Ten years building high-volume Shopify storefronts for retail brands.";

describe("scanProfileProse", () => {
  it("passes ordinary profile prose", () => {
    expect(
      scanProfileProse([
        { field: "bio", text: clean },
        { field: "headline", text: "Senior Shopify developer" },
      ]),
    ).toBeNull();
  });

  it("names the field that tripped, not just the fact that something did", () => {
    const flag = scanProfileProse([
      { field: "headline", text: "Senior Shopify developer" },
      { field: "bio", text: "Applicants must pay a refundable deposit before we start." },
    ]);

    expect(flag?.field).toBe("bio");
    expect(flag?.match.reason).toBe("UPFRONT_PAYMENT");
  });

  it("catches the three categories CLAUDE.md names", () => {
    const upfront = scanProfileProse([
      { field: "description", text: "A one-time registration fee applies to all hires." },
    ]);
    expect(upfront?.match.reason).toBe("UPFRONT_PAYMENT");

    const unpaid = scanProfileProse([
      { field: "description", text: "Every candidate completes an unpaid trial task, about 20 hours." },
    ]);
    expect(unpaid?.match.reason).toBe("LONG_UNPAID_TEST");

    // A bare app name is not enough — it needs payment-REQUEST language near
    // it, or "we integrate PayPal" would be a flag.
    const offPlatform = scanProfileProse([
      { field: "description", text: "We pay our contractors weekly via Telegram." },
    ]);
    expect(offPlatform?.match.reason).toBe("OFF_PLATFORM_PAYMENT");

    expect(
      scanProfileProse([
        { field: "description", text: "We build PayPal and Stripe integrations for retailers." },
      ]),
    ).toBeNull();
  });

  it("stops at the first field in the order the caller gave", () => {
    // The caller orders fields so the most likely culprit is highlighted first.
    const flag = scanProfileProse([
      { field: "description", text: "Pay a security deposit." },
      { field: "companyName", text: "Pay a training fee." },
    ]);
    expect(flag?.field).toBe("description");
  });

  it("skips empty and absent fields rather than scanning an empty string", () => {
    expect(
      scanProfileProse([
        { field: "description", text: null },
        { field: "bio", text: undefined },
        { field: "headline", text: "" },
      ]),
    ).toBeNull();
  });

  it("inherits the job scanner's asymmetry on negation, exactly", () => {
    // Negation rescues an unpaid-test mention, but only within
    // NEGATION_LOOKBACK_TOKENS (4) of it — "never" five words out does not
    // reach.
    expect(
      scanProfileProse([
        { field: "description", text: "We never ask for unpaid test work; every task is paid." },
      ]),
    ).toBeNull();

    // ...but NOT an upfront-payment term, which flags on any occurrence
    // (lib/services/safety.ts:182 checks the term list before any negation
    // logic). A company page insisting it has no registration fee is still
    // worth a moderator's glance, and this is the shared scanner's behaviour
    // rather than anything profile-specific — routing through it instead of a
    // second term list is what keeps the two from drifting apart.
    expect(
      scanProfileProse([{ field: "description", text: "We never ask for a registration fee." }])
        ?.match.reason,
    ).toBe("UPFRONT_PAYMENT");
  });
});

describe("safetyReasonPhrase", () => {
  it("gives each reason a phrase that fits inside a sentence", () => {
    expect(safetyReasonPhrase("UPFRONT_PAYMENT")).toBe("asking someone to pay a fee or deposit");
    expect(safetyReasonPhrase("LONG_UNPAID_TEST")).toBe(
      "an unpaid test task longer than four hours",
    );
    expect(safetyReasonPhrase("OFF_PLATFORM_PAYMENT")).toBe(
      "arranging payment through an outside app",
    );
  });

  it("falls back rather than rendering a raw enum at a user", () => {
    expect(safetyReasonPhrase("SUSPECTED_SCAM")).toBe(
      "something our safety checks do not allow",
    );
  });
});
