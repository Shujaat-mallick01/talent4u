import { describe, expect, it } from "vitest";

import { EARLY_ACCESS_HOURS, earlyAccessCutoffFor, jobSlotsForPlan } from "./plans";

describe("earlyAccessCutoffFor", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("gives Pro freelancers no cutoff (they see everything)", () => {
    expect(earlyAccessCutoffFor("FREELANCER_PRO", now)).toBeNull();
  });

  it("delays everyone else by EARLY_ACCESS_HOURS", () => {
    const expected = new Date(now.getTime() - EARLY_ACCESS_HOURS * 60 * 60 * 1000);
    expect(earlyAccessCutoffFor(null, now)?.getTime()).toBe(expected.getTime());
    expect(earlyAccessCutoffFor("FREE", now)?.getTime()).toBe(expected.getTime());
    expect(earlyAccessCutoffFor("RECRUITER_TEAM", now)?.getTime()).toBe(expected.getTime());
  });
});

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
