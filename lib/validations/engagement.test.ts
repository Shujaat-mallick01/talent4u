import { describe, expect, it } from "vitest";

import {
  engagementTermsSchema,
  formatDuration,
  formatStatedRate,
  proposeEngagementSchema,
} from "./engagement";

/**
 * CLAUDE.md requires an engagement to carry a stated rate AND duration — they
 * are what both parties are confirming. The columns are nullable for older
 * rows, so the schema is where "required" is actually enforced.
 */
describe("engagementTermsSchema", () => {
  it("accepts a whole-dollar rate and whole weeks", () => {
    expect(engagementTermsSchema.parse({ statedRateUsd: 4000, durationWeeks: 6 })).toEqual({
      statedRateUsd: 4000,
      durationWeeks: 6,
    });
  });

  it("requires both — neither may be omitted", () => {
    expect(engagementTermsSchema.safeParse({ statedRateUsd: 4000 }).success).toBe(false);
    expect(engagementTermsSchema.safeParse({ durationWeeks: 6 }).success).toBe(false);
    expect(engagementTermsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects zero, negative, and fractional figures", () => {
    for (const bad of [0, -1, 12.5]) {
      expect(engagementTermsSchema.safeParse({ statedRateUsd: bad, durationWeeks: 6 }).success).toBe(
        false,
      );
      expect(
        engagementTermsSchema.safeParse({ statedRateUsd: 4000, durationWeeks: bad }).success,
      ).toBe(false);
    }
  });

  it("rejects NaN, which is what an empty or non-numeric form field becomes", () => {
    expect(
      engagementTermsSchema.safeParse({ statedRateUsd: Number.NaN, durationWeeks: 6 }).success,
    ).toBe(false);
  });

  it("rejects a duration past ten years as a typo", () => {
    expect(engagementTermsSchema.safeParse({ statedRateUsd: 100, durationWeeks: 521 }).success).toBe(
      false,
    );
    expect(engagementTermsSchema.safeParse({ statedRateUsd: 100, durationWeeks: 520 }).success).toBe(
      true,
    );
  });

  it("rejects an implausible rate", () => {
    expect(
      engagementTermsSchema.safeParse({ statedRateUsd: 100001, durationWeeks: 1 }).success,
    ).toBe(false);
  });
});

describe("proposeEngagementSchema", () => {
  it("carries the application id and nothing identifying the parties", () => {
    const parsed = proposeEngagementSchema.parse({
      applicationId: "app_1",
      statedRateUsd: 500,
      durationWeeks: 2,
    });
    expect(parsed).toEqual({ applicationId: "app_1", statedRateUsd: 500, durationWeeks: 2 });
    // A caller naming the parties directly is the thing this prevents.
    expect(Object.keys(parsed)).not.toContain("freelancerId");
    expect(Object.keys(parsed)).not.toContain("recruiterId");
  });

  it("strips any party ids a caller tries to smuggle in", () => {
    const parsed = proposeEngagementSchema.parse({
      applicationId: "app_1",
      statedRateUsd: 500,
      durationWeeks: 2,
      freelancerId: "fl_victim",
      recruiterId: "rec_attacker",
    });
    expect(parsed).not.toHaveProperty("freelancerId");
    expect(parsed).not.toHaveProperty("recruiterId");
  });

  it("requires an application id", () => {
    expect(
      proposeEngagementSchema.safeParse({
        applicationId: "",
        statedRateUsd: 500,
        durationWeeks: 2,
      }).success,
    ).toBe(false);
  });
});

describe("formatting", () => {
  it("writes the rate as a plain dollar figure without implying a unit", () => {
    expect(formatStatedRate(4000)).toBe("$4,000");
    expect(formatStatedRate(75)).toBe("$75");
  });

  it("pluralises the duration", () => {
    expect(formatDuration(1)).toBe("1 week");
    expect(formatDuration(6)).toBe("6 weeks");
  });
});
