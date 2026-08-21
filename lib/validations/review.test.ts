import { describe, expect, it } from "vitest";

import { ratingSchema, writeReviewSchema } from "./review";

const BODY = "They scoped the work clearly and paid on the day we agreed. Would work again.";

describe("ratingSchema", () => {
  it("accepts 1 through 5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(ratingSchema.parse(n)).toBe(n);
  });

  it("coerces the string a radio input actually submits", () => {
    expect(ratingSchema.parse("4")).toBe(4);
  });

  it("rejects out-of-range and fractional stars", () => {
    for (const bad of [0, 6, -1, 3.5, 100]) {
      expect(ratingSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects empty and non-numeric input", () => {
    // Number("") is 0, which the range rule rejects — worth pinning, since a
    // missing radio would otherwise coerce to a valid-looking number.
    expect(ratingSchema.safeParse("").success).toBe(false);
    expect(ratingSchema.safeParse("five").success).toBe(false);
  });
});

describe("writeReviewSchema", () => {
  it("accepts a real review", () => {
    const parsed = writeReviewSchema.parse({ engagementId: "eng_1", rating: "5", body: BODY });
    expect(parsed).toEqual({ engagementId: "eng_1", rating: 5, body: BODY });
  });

  it("rejects a body too short to tell the next person anything", () => {
    expect(
      writeReviewSchema.safeParse({ engagementId: "eng_1", rating: 5, body: "Great!" }).success,
    ).toBe(false);
  });

  it("counts the trimmed body, so whitespace cannot pad it to length", () => {
    expect(
      writeReviewSchema.safeParse({ engagementId: "eng_1", rating: 5, body: `Good.${" ".repeat(80)}` })
        .success,
    ).toBe(false);
  });

  it("rejects a body past the cap", () => {
    expect(
      writeReviewSchema.safeParse({ engagementId: "eng_1", rating: 5, body: "x".repeat(2001) })
        .success,
    ).toBe(false);
  });

  it("never carries an author or a subject — the server derives both", () => {
    const parsed = writeReviewSchema.parse({
      engagementId: "eng_1",
      rating: 5,
      body: BODY,
      authorFreelancerId: "fl_impostor",
      subjectRecruiterId: "rec_victim",
    });
    expect(parsed).not.toHaveProperty("authorFreelancerId");
    expect(parsed).not.toHaveProperty("subjectRecruiterId");
  });

  it("requires an engagement id", () => {
    expect(writeReviewSchema.safeParse({ engagementId: "", rating: 5, body: BODY }).success).toBe(
      false,
    );
  });
});
