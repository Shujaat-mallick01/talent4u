import { describe, expect, it } from "vitest";

import { jobSlotsForPlan } from "./plans";

describe("jobSlotsForPlan", () => {
  it("matches the non-negotiable tiers: Free 1, Growth 5, Team unlimited", () => {
    expect(jobSlotsForPlan("FREE")).toBe(1);
    expect(jobSlotsForPlan("RECRUITER_GROWTH")).toBe(5);
    expect(jobSlotsForPlan("RECRUITER_TEAM")).toBeNull();
  });

  it("treats a non-recruiter plan as the free cap", () => {
    expect(jobSlotsForPlan("FREELANCER_PRO")).toBe(1);
  });
});
