import { describe, expect, it } from "vitest";

import {
  advertisedEntitlements,
  effectiveJobSlots,
  getEntitlements,
  jobSlotsForTier,
  seatsForPlan,
} from "./entitlements";

/**
 * The capability matrix from CLAUDE.md's "Non-negotiable business rules".
 * Every line here corresponds to a sentence in that file; if one of these
 * fails, the product is no longer the one that was specified.
 */

describe("browsing is never gated", () => {
  it("is true for a logged-out visitor", () => {
    // CLAUDE.md: "Browsing jobs is always free and unlimited, including for
    // logged-out visitors. Job pages are SEO surface — never gate them."
    expect(getEntitlements({ role: null, plan: "FREE" }).browseJobs).toBe(true);
  });

  it("is true on every plan and every role", () => {
    const plans = ["FREE", "FREELANCER_PRO", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const;
    for (const plan of plans) {
      expect(getEntitlements({ role: "FREELANCER", plan }).browseJobs).toBe(true);
      expect(getEntitlements({ role: "RECRUITER", plan }).browseJobs).toBe(true);
    }
  });
});

describe("freelancer entitlements", () => {
  it("gives free freelancers 12 applications per rolling 30 days", () => {
    const e = getEntitlements({ role: "FREELANCER", plan: "FREE" });
    expect(e.freelancer.applicationsPerWindow).toBe(12);
    expect(e.freelancer.applicationWindowDays).toBe(30);
  });

  it("gives Pro unlimited applications", () => {
    expect(
      getEntitlements({ role: "FREELANCER", plan: "FREELANCER_PRO" }).freelancer
        .applicationsPerWindow,
    ).toBeNull();
  });

  it("delays new jobs 6 hours for free, and not at all for Pro", () => {
    expect(
      getEntitlements({ role: "FREELANCER", plan: "FREE" }).freelancer.earlyAccessDelayHours,
    ).toBe(6);
    expect(
      getEntitlements({ role: "FREELANCER", plan: "FREELANCER_PRO" }).freelancer
        .earlyAccessDelayHours,
    ).toBe(0);
  });

  it("puts search boost and analytics behind Pro", () => {
    const free = getEntitlements({ role: "FREELANCER", plan: "FREE" }).freelancer;
    expect(free.searchBoost).toBe(false);
    expect(free.applicationAnalytics).toBe(false);

    const pro = getEntitlements({ role: "FREELANCER", plan: "FREELANCER_PRO" }).freelancer;
    expect(pro.searchBoost).toBe(true);
    expect(pro.applicationAnalytics).toBe(true);
  });

  it("gives a logged-out visitor the free window but no application allowance", () => {
    const e = getEntitlements({ role: null, plan: "FREE" });
    expect(e.freelancer.earlyAccessDelayHours).toBe(6);
    expect(e.freelancer.applicationsPerWindow).toBe(0);
  });

  it("does not hand freelancer perks to a recruiter holding a Pro plan row", () => {
    const e = getEntitlements({ role: "RECRUITER", plan: "FREELANCER_PRO", recruiterTier: "VERIFIED" });
    expect(e.freelancer.searchBoost).toBe(false);
    expect(e.freelancer.earlyAccessDelayHours).toBe(6);
  });
});

describe("recruiter entitlements", () => {
  const verified = (plan: Parameters<typeof getEntitlements>[0]["plan"]) =>
    getEntitlements({ role: "RECRUITER", plan, recruiterTier: "VERIFIED" }).recruiter;

  it("matches the plan table: Free 1 post, Growth 5, Team unlimited", () => {
    expect(verified("FREE").activeJobPosts).toBe(1);
    expect(verified("RECRUITER_GROWTH").activeJobPosts).toBe(5);
    expect(verified("RECRUITER_TEAM").activeJobPosts).toBeNull();
  });

  it("keeps candidate search behind the paid wall", () => {
    // CLAUDE.md: "Candidate search is the paid wall. Free recruiters must
    // never reach search, filters, or outbound messaging."
    expect(verified("FREE").candidateSearch).toBe(false);
    expect(verified("FREE").searchFilters).toBe(false);
    expect(verified("FREE").pipelines).toBe(false);
    expect(verified("FREE").privateNotes).toBe(false);

    expect(verified("RECRUITER_GROWTH").candidateSearch).toBe(true);
    expect(verified("RECRUITER_TEAM").candidateSearch).toBe(true);
  });

  it("still lets a free recruiter receive applications", () => {
    expect(verified("FREE").receiveApplications).toBe(true);
  });

  it("gives Team 5 seats and export; nobody else", () => {
    expect(verified("RECRUITER_TEAM").seats).toBe(5);
    expect(verified("RECRUITER_TEAM").exportCandidates).toBe(true);

    expect(verified("RECRUITER_GROWTH").seats).toBe(1);
    expect(verified("RECRUITER_GROWTH").exportCandidates).toBe(false);
  });

  it("gives every recruiter a public company page, on every plan", () => {
    // /companies/[slug] is public, indexed SEO surface and has been ungated
    // since Phase 2. Advertising it as a paid feature would tell a Growth
    // customer they lack a page they already have.
    for (const plan of ["FREE", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const) {
      expect(verified(plan).companyPage).toBe(true);
    }
  });

  it("gives a freelancer no recruiter capabilities at all", () => {
    const e = getEntitlements({ role: "FREELANCER", plan: "FREELANCER_PRO" }).recruiter;
    expect(e.activeJobPosts).toBe(0);
    expect(e.candidateSearch).toBe(false);
    expect(e.initiateMessages).toBe(false);
    expect(e.seats).toBe(0);
  });
});

/**
 * The verification tier restricts independently of the plan. CLAUDE.md's tier
 * table: UNVERIFIED = "Max 1 post. Cannot initiate messages."
 */
describe("verification tier caps what money cannot lift", () => {
  it("caps an UNVERIFIED company at one post on every plan", () => {
    for (const plan of ["FREE", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const) {
      expect(
        getEntitlements({ role: "RECRUITER", plan, recruiterTier: "UNVERIFIED" }).recruiter
          .activeJobPosts,
      ).toBe(1);
    }
  });

  it("lifts the tier cap once verified, leaving the plan cap", () => {
    expect(jobSlotsForTier("UNVERIFIED")).toBe(1);
    expect(jobSlotsForTier("VERIFIED")).toBeNull();
    expect(jobSlotsForTier("TRUSTED")).toBeNull();

    expect(effectiveJobSlots("RECRUITER_TEAM", "UNVERIFIED")).toBe(1);
    expect(effectiveJobSlots("RECRUITER_TEAM", "VERIFIED")).toBeNull();
    expect(effectiveJobSlots("RECRUITER_GROWTH", "TRUSTED")).toBe(5);
    // The stricter of the two always wins, in both directions.
    expect(effectiveJobSlots("FREE", "TRUSTED")).toBe(1);
  });

  it("treats a missing tier as unverified rather than unrestricted", () => {
    expect(jobSlotsForTier(null)).toBe(1);
    expect(jobSlotsForTier(undefined)).toBe(1);
  });

  it("refuses outbound messaging to an UNVERIFIED company however much they pay", () => {
    for (const plan of ["FREE", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const) {
      expect(
        getEntitlements({ role: "RECRUITER", plan, recruiterTier: "UNVERIFIED" }).recruiter
          .initiateMessages,
      ).toBe(false);
    }
  });

  it("allows it once verified", () => {
    expect(
      getEntitlements({ role: "RECRUITER", plan: "FREE", recruiterTier: "VERIFIED" }).recruiter
        .initiateMessages,
    ).toBe(true);
    expect(
      getEntitlements({ role: "RECRUITER", plan: "FREE", recruiterTier: "TRUSTED" }).recruiter
        .initiateMessages,
    ).toBe(true);
  });
});

describe("advertisedEntitlements", () => {
  it("reads FREE as two different offers depending on the audience", () => {
    // One plan row, two products: the freelancer free tier and the recruiter
    // free tier are not the same thing and must not render as one column.
    expect(advertisedEntitlements("FREELANCER", "FREE").freelancer.applicationsPerWindow).toBe(12);
    expect(advertisedEntitlements("RECRUITER", "FREE").recruiter.activeJobPosts).toBe(1);
    expect(advertisedEntitlements("FREELANCER", "FREE").recruiter.activeJobPosts).toBe(0);
  });

  it("advertises a plan as a verified company would experience it", () => {
    expect(advertisedEntitlements("RECRUITER", "RECRUITER_TEAM").recruiter.activeJobPosts).toBeNull();
  });
});

describe("seatsForPlan", () => {
  it("is 5 on Team and 1 everywhere else", () => {
    expect(seatsForPlan("RECRUITER_TEAM")).toBe(5);
    expect(seatsForPlan("RECRUITER_GROWTH")).toBe(1);
    expect(seatsForPlan("FREE")).toBe(1);
  });
});
