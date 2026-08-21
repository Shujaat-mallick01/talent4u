import { describe, expect, it } from "vitest";

import { scanTextForSafetyFlags } from "./safety";

describe("scanTextForSafetyFlags", () => {
  it("flags upfront payment language on any occurrence", () => {
    expect(scanTextForSafetyFlags("A $50 registration fee applies.")).toMatchObject({
      reason: "UPFRONT_PAYMENT",
      matchedTerm: "registration fee",
    });
    expect(scanTextForSafetyFlags("Requires a refundable deposit before starting")).toMatchObject({
      reason: "UPFRONT_PAYMENT",
    });
  });

  it("is case-insensitive", () => {
    expect(scanTextForSafetyFlags("REGISTRATION FEE required")).toMatchObject({
      reason: "UPFRONT_PAYMENT",
    });
  });

  // CLAUDE.md: hold "unpaid test tasks estimated ABOVE 4 HOURS" — the size is
  // the trigger, not the existence of a take-home.
  it("flags an unpaid test estimated above 4 hours", () => {
    expect(
      scanTextForSafetyFlags(
        "Shortlisted candidates complete an unpaid trial build. Most people tell us it takes somewhere between twenty and twenty-five hours.",
      ),
    ).toMatchObject({ reason: "LONG_UNPAID_TEST", matchedTerm: "unpaid trial" });
    expect(
      scanTextForSafetyFlags("There is an unpaid test task; budget 6 to 8 hours for it."),
    ).toMatchObject({ reason: "LONG_UNPAID_TEST" });
    expect(
      scanTextForSafetyFlags("We ask for an unpaid sample — two days of work."),
    ).toMatchObject({ reason: "LONG_UNPAID_TEST" });
  });

  it("flags an unpaid test with NO stated bound (it cannot be shown to be small)", () => {
    expect(
      scanTextForSafetyFlags("shortlisted candidates complete an unpaid trial build"),
    ).toMatchObject({ reason: "LONG_UNPAID_TEST", matchedTerm: "unpaid trial" });
  });

  it("does NOT flag a short, honestly-bounded take-home", () => {
    expect(
      scanTextForSafetyFlags(
        "We use a small unpaid test task to see how you work — it takes about 2 hours and we review it with you.",
      ),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("There's an unpaid trial exercise capped at 4 hours."),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("An unpaid sample of a couple of hours, nothing more."),
    ).toBeNull();
  });

  it("does NOT flag a post promising the opposite", () => {
    expect(
      scanTextForSafetyFlags("We never ask for unpaid test work — every interview task is paid."),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("No unpaid trial here; we pay for your time from day one."),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("We don't do unpaid test tasks, and we don't do take-home marathons."),
    ).toBeNull();
  });

  it("flags payment apps paired with payment-request language", () => {
    expect(
      scanTextForSafetyFlags(
        "Send your PayPal address with your application and we will arrange the first transfer off site.",
      ),
    ).toMatchObject({ reason: "OFF_PLATFORM_PAYMENT", matchedTerm: "paypal" });
    expect(scanTextForSafetyFlags("we pay weekly via whatsapp")).toMatchObject({
      reason: "OFF_PLATFORM_PAYMENT",
      matchedTerm: "whatsapp",
    });
  });

  it("does NOT flag payment apps mentioned as legitimate work subjects", () => {
    // Core platform use case: automation jobs about these tools.
    expect(
      scanTextForSafetyFlags("Build a WhatsApp chatbot for our customer support team."),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("Experience with the PayPal integration API is required."),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("Migrate our Telegram bot to the new framework."),
    ).toBeNull();
  });

  it("catches a payment context that follows the app mention at a distance", () => {
    expect(
      scanTextForSafetyFlags("Contact us on telegram. All invoices are settled there weekly."),
    ).toMatchObject({ reason: "OFF_PLATFORM_PAYMENT", matchedTerm: "telegram" });
  });

  it("returns null for a clean post", () => {
    expect(
      scanTextForSafetyFlags(
        "We need a senior Next.js developer to rebuild our logistics portal. Fully remote, paid monthly through the platform.",
      ),
    ).toBeNull();
  });

  // Regression: normalization defeats trivial obfuscation of listed terms.
  it("catches obfuscated terms (hyphen, spacing, newline, zero-width, homoglyph)", () => {
    expect(scanTextForSafetyFlags("a small registration-fee applies")).toMatchObject({
      reason: "UPFRONT_PAYMENT",
    });
    expect(scanTextForSafetyFlags("a registration  fee applies")).toMatchObject({
      reason: "UPFRONT_PAYMENT",
    });
    expect(scanTextForSafetyFlags("a registration\nfee applies")).toMatchObject({
      reason: "UPFRONT_PAYMENT",
    });
    const zw = `regis${String.fromCharCode(0x200b)}tration fee required`;
    expect(scanTextForSafetyFlags(zw)).toMatchObject({ reason: "UPFRONT_PAYMENT" });
    // Cyrillic а/е in "registration fee"
    expect(scanTextForSafetyFlags("registrаtion fеe required")).toMatchObject({
      reason: "UPFRONT_PAYMENT",
    });
  });

  // Regression: request SHAPES flag; compensation vocabulary alone does not.
  it("does not hold posts that merely discuss payment features", () => {
    expect(
      scanTextForSafetyFlags("Integrate PayPal payments into our checkout flow."),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("Build a Telegram bot that sends payment reminders to customers."),
    ).toBeNull();
    expect(
      scanTextForSafetyFlags("Experience with Venmo's payout API documentation is a plus."),
    ).toBeNull();
  });

  it("still flags explicit request shapes", () => {
    expect(scanTextForSafetyFlags("we pay through zelle every friday")).toMatchObject({
      reason: "OFF_PLATFORM_PAYMENT",
    });
    expect(scanTextForSafetyFlags("send us your cash app handle to get started")).toMatchObject({
      reason: "OFF_PLATFORM_PAYMENT",
    });
  });
});
