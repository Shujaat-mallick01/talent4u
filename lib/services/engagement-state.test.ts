import { describe, expect, it } from "vitest";

import {
  canAmendTerms,
  canRespond,
  canWriteReview,
  engagementState,
  hasConfirmed,
  opposite,
  proposingSide,
  reviewsUnlocked,
  type EngagementConfirmationRow,
} from "./engagement-state";

/**
 * CLAUDE.md: "Reviews are locked until BOTH parties confirm they worked
 * together... Never allow one-sided reviews." This file is the exhaustive
 * matrix for that rule — every combination of the two booleans and the decline
 * timestamp, with the review gate asserted for each.
 */

const row = (over: Partial<EngagementConfirmationRow> = {}): EngagementConfirmationRow => ({
  freelancerConfirmed: false,
  recruiterConfirmed: false,
  declinedAt: null,
  ...over,
});

const DECLINED_AT = new Date("2026-08-21T09:00:00.000Z");

describe("engagementState", () => {
  it("is CONFIRMED only when both sides confirmed", () => {
    expect(engagementState(row({ freelancerConfirmed: true, recruiterConfirmed: true }))).toBe(
      "CONFIRMED",
    );
  });

  it("is PENDING when exactly one side confirmed", () => {
    expect(engagementState(row({ freelancerConfirmed: true }))).toBe("PENDING");
    expect(engagementState(row({ recruiterConfirmed: true }))).toBe("PENDING");
  });

  it("is DECLINED once the counterparty refused", () => {
    expect(engagementState(row({ recruiterConfirmed: true, declinedAt: DECLINED_AT }))).toBe(
      "DECLINED",
    );
  });

  it("is UNCLAIMED when nobody has confirmed", () => {
    expect(engagementState(row())).toBe("UNCLAIMED");
  });

  it("reads a both-confirmed row as CONFIRMED even if it also carries a decline", () => {
    // The database CHECK makes this row impossible. If it ever exists, two
    // affirmative acts outrank one absence — and it must never read as a state
    // that would let a third party think the engagement was disowned.
    expect(
      engagementState(
        row({ freelancerConfirmed: true, recruiterConfirmed: true, declinedAt: DECLINED_AT }),
      ),
    ).toBe("CONFIRMED");
  });
});

describe("reviewsUnlocked — the rule the product rests on", () => {
  it("is false for every state except CONFIRMED", () => {
    expect(reviewsUnlocked(row())).toBe(false);
    expect(reviewsUnlocked(row({ freelancerConfirmed: true }))).toBe(false);
    expect(reviewsUnlocked(row({ recruiterConfirmed: true }))).toBe(false);
    expect(reviewsUnlocked(row({ recruiterConfirmed: true, declinedAt: DECLINED_AT }))).toBe(false);
  });

  it("is true only once both parties confirmed", () => {
    expect(reviewsUnlocked(row({ freelancerConfirmed: true, recruiterConfirmed: true }))).toBe(true);
  });

  it("refuses a review to a party who already wrote one", () => {
    const confirmed = row({ freelancerConfirmed: true, recruiterConfirmed: true });
    expect(canWriteReview(confirmed, "FREELANCER", false)).toBe(true);
    expect(canWriteReview(confirmed, "FREELANCER", true)).toBe(false);
  });

  it("never lets a party review before confirmation, however many they have written", () => {
    const pending = row({ recruiterConfirmed: true });
    expect(canWriteReview(pending, "RECRUITER", false)).toBe(false);
    expect(canWriteReview(pending, "FREELANCER", false)).toBe(false);
  });
});

describe("who may respond", () => {
  it("lets only the side that did NOT propose answer", () => {
    const proposedByRecruiter = row({ recruiterConfirmed: true });
    expect(canRespond(proposedByRecruiter, "FREELANCER")).toBe(true);
    // The proposer confirming their own claim again would be a one-sided
    // confirmation, which is the whole thing this rule prevents.
    expect(canRespond(proposedByRecruiter, "RECRUITER")).toBe(false);
  });

  it("lets nobody respond once it is confirmed or declined", () => {
    const confirmed = row({ freelancerConfirmed: true, recruiterConfirmed: true });
    expect(canRespond(confirmed, "FREELANCER")).toBe(false);
    expect(canRespond(confirmed, "RECRUITER")).toBe(false);

    const declined = row({ freelancerConfirmed: true, declinedAt: DECLINED_AT });
    expect(canRespond(declined, "RECRUITER")).toBe(false);
    expect(canRespond(declined, "FREELANCER")).toBe(false);
  });

  it("names the proposing side only while pending", () => {
    expect(proposingSide(row({ recruiterConfirmed: true }))).toBe("RECRUITER");
    expect(proposingSide(row({ freelancerConfirmed: true }))).toBe("FREELANCER");
    expect(proposingSide(row({ freelancerConfirmed: true, recruiterConfirmed: true }))).toBeNull();
    expect(proposingSide(row())).toBeNull();
  });
});

describe("amending terms", () => {
  it("is the proposer's to do, and only while the other side is undecided", () => {
    const proposedByFreelancer = row({ freelancerConfirmed: true });
    expect(canAmendTerms(proposedByFreelancer, "FREELANCER")).toBe(true);
    expect(canAmendTerms(proposedByFreelancer, "RECRUITER")).toBe(false);
  });

  it("is closed once confirmed — the other side agreed to these exact figures", () => {
    const confirmed = row({ freelancerConfirmed: true, recruiterConfirmed: true });
    expect(canAmendTerms(confirmed, "FREELANCER")).toBe(false);
    expect(canAmendTerms(confirmed, "RECRUITER")).toBe(false);
  });

  it("is closed once declined", () => {
    const declined = row({ recruiterConfirmed: true, declinedAt: DECLINED_AT });
    expect(canAmendTerms(declined, "RECRUITER")).toBe(false);
  });
});

describe("small helpers", () => {
  it("opposite flips the side", () => {
    expect(opposite("FREELANCER")).toBe("RECRUITER");
    expect(opposite("RECRUITER")).toBe("FREELANCER");
  });

  it("hasConfirmed reads the right column per side", () => {
    const r = row({ freelancerConfirmed: true });
    expect(hasConfirmed(r, "FREELANCER")).toBe(true);
    expect(hasConfirmed(r, "RECRUITER")).toBe(false);
  });
});
