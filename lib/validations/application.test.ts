import { describe, expect, it } from "vitest";

import { applyToJobSchema } from "./application";

const valid = () => ({
  coverLetter:
    "I have shipped three logistics portals on this exact stack and can start within a week. Happy to walk through the checkout rebuild I did last quarter.",
  proposedRateUsd: 45,
});

describe("applyToJobSchema", () => {
  it("accepts a valid application", () => {
    expect(applyToJobSchema.safeParse(valid()).success).toBe(true);
  });

  it("measures the cover letter AFTER trimming", () => {
    expect(applyToJobSchema.safeParse({ ...valid(), coverLetter: "x".repeat(80) }).success).toBe(
      true,
    );
    expect(applyToJobSchema.safeParse({ ...valid(), coverLetter: "x".repeat(79) }).success).toBe(
      false,
    );
    // 80+ spaces trim to nothing.
    expect(applyToJobSchema.safeParse({ ...valid(), coverLetter: " ".repeat(120) }).success).toBe(
      false,
    );
  });

  it("enforces the 3000-char maximum", () => {
    expect(applyToJobSchema.safeParse({ ...valid(), coverLetter: "x".repeat(3000) }).success).toBe(
      true,
    );
    expect(applyToJobSchema.safeParse({ ...valid(), coverLetter: "x".repeat(3001) }).success).toBe(
      false,
    );
  });

  it("defaults a missing rate to null and accepts explicit null", () => {
    const missing = applyToJobSchema.safeParse({ coverLetter: valid().coverLetter });
    expect(missing.success).toBe(true);
    if (missing.success) expect(missing.data.proposedRateUsd).toBeNull();
    expect(
      applyToJobSchema.safeParse({ ...valid(), proposedRateUsd: null }).success,
    ).toBe(true);
  });

  it("rejects zero, negative, fractional, and absurd rates", () => {
    for (const bad of [0, -5, 45.5, 100001]) {
      expect(applyToJobSchema.safeParse({ ...valid(), proposedRateUsd: bad }).success).toBe(false);
    }
    expect(applyToJobSchema.safeParse({ ...valid(), proposedRateUsd: 100000 }).success).toBe(true);
  });
});
