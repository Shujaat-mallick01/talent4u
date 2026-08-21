import { describe, expect, it } from "vitest";

import { scanTextForSafetyFlags } from "./safety";

/**
 * The corpus that the Phase 4.2 adversarial review built. Every string here
 * was a real defect: the first group auto-published a long unpaid test by
 * slipping one ordinary word near the term, the second held honest posts.
 * They exist so a future change to the heuristics cannot quietly regress
 * either direction.
 */

const held = (text: string) => scanTextForSafetyFlags(text) !== null;

describe("evasion corpus — these must all be HELD", () => {
  const evasions = [
    "This role is not remote; the unpaid test takes 30 hours.",
    "There is no charge, and the unpaid test takes 30 hours.",
    "Perks: no dress code, no standups, no meetings. Unpaid test task: 30 hours.",
    "We avoid bureaucracy. Our unpaid test task takes 30 hours.",
    "Remote without relocation, and the unpaid trial runs 40 hours.",
    "Skip the phone screen; instead, the unpaid test takes 30 hours.",
    "We move fast rather than slow: the unpaid test takes 30 hours.",
    "We offer no equity, but the unpaid trial is roughly 40 hours.",
    "There is no rush: the unpaid test task takes 30 hours.",
    "No agencies, no recruiters. Unpaid test task: 30 hours.",
    "Apply without a CV — the unpaid trial runs 40 hours.",
    "Zero experience needed. The unpaid test takes 30 hours.",
    "This role is not remote and the unpaid test takes 30 hours.",
    // A small number in a DIFFERENT sentence must not bound the ask.
    "We reply within 2 hours. There is an unpaid trial build to complete.",
    // Vague-but-large durations.
    "Shortlisted candidates do an unpaid test task over a full week.",
    "The unpaid trial takes several days.",
  ];

  for (const text of evasions) {
    it(`holds: ${text.slice(0, 60)}…`, () => {
      expect(held(text)).toBe(true);
    });
  }
});

describe("honest-post corpus — these must all PUBLISH", () => {
  const honest = [
    // Genuine denials.
    "We never ask for unpaid test work — every interview task is paid.",
    "No unpaid trial here; we pay for your time from day one.",
    "We don't do unpaid test tasks, and we don't do take-home marathons.",
    // Genuinely small, bounded take-homes.
    "There is a short unpaid test task of about 2 hours, reviewed with you live.",
    "An unpaid trial exercise capped at 4 hours.",
    "The unpaid sample takes half an hour.",
    "We use a 90 minute unpaid test task.",
    "There's an unpaid test task, about 1.5 hours.",
    // Numbers that are schedules or rates, not task sizes.
    "Full-time, 40 hours per week. The unpaid test task takes 2 hours.",
    "We pay $95 per hour. The unpaid trial is a 3 hour exercise.",
    // Ordinary copy that must not trip the payment-app rule.
    "The role involves maintaining our PayPal and Stripe integrations.",
    "Build a WhatsApp chatbot for our customer support team.",
    "Everyone is paid monthly through payroll. We also run a Telegram community.",
    // "spec work" must not be manufactured across a clause boundary.
    "Everything is built to spec, working closely with our designer.",
  ];

  for (const text of honest) {
    it(`publishes: ${text.slice(0, 60)}…`, () => {
      expect(scanTextForSafetyFlags(text)).toBeNull();
    });
  }
});

describe("the core rule still fires", () => {
  it("holds every CLAUDE.md upfront-payment term", () => {
    for (const phrase of [
      "a registration fee of $40",
      "a security deposit is required",
      "a training fee applies",
      "an equipment purchase is needed",
      "a processing fee of 2%",
    ]) {
      expect(scanTextForSafetyFlags(phrase)).toMatchObject({ reason: "UPFRONT_PAYMENT" });
    }
  });

  it("holds an off-platform payment request", () => {
    expect(
      scanTextForSafetyFlags("Send us your PayPal address and we'll arrange the first transfer."),
    ).toMatchObject({ reason: "OFF_PLATFORM_PAYMENT" });
  });

  it("holds an unbounded unpaid test", () => {
    expect(
      scanTextForSafetyFlags("Shortlisted candidates complete an unpaid trial build."),
    ).toMatchObject({ reason: "LONG_UNPAID_TEST" });
  });
});
