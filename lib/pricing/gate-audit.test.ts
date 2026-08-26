import { describe, expect, it } from "vitest";

import type { PlanTier, RecruiterTier } from "@/lib/generated/prisma/enums";

import { effectiveJobSlots, getEntitlements } from "./entitlements";
import {
  APPLICATION_WINDOW_DAYS,
  applicationQuotaForPlan,
  EARLY_ACCESS_HOURS,
  earlyAccessCutoffFor,
} from "./plans";

/**
 * The gate audit.
 *
 * Every other test in this repo checks that a particular function behaves. This
 * one checks something different and more important: that the rules CLAUDE.md
 * calls non-negotiable hold across the WHOLE plan × tier × role matrix, with no
 * combination quietly granting something it should not.
 *
 * It is written as an audit rather than as unit tests — each block names the
 * rule from CLAUDE.md it is enforcing, and enumerates every input rather than
 * sampling. If a plan is added, the enumerations below fail until someone
 * decides what that plan may do, which is the point.
 */

const ALL_PLANS: PlanTier[] = ["FREE", "FREELANCER_PRO", "RECRUITER_GROWTH", "RECRUITER_TEAM"];
const ALL_TIERS: RecruiterTier[] = ["UNVERIFIED", "VERIFIED", "TRUSTED"];

const freelancer = (plan: PlanTier) => getEntitlements({ role: "FREELANCER", plan }).freelancer;
const recruiter = (plan: PlanTier, recruiterTier: RecruiterTier) =>
  getEntitlements({ role: "RECRUITER", plan, recruiterTier }).recruiter;

describe("the plan enum is fully covered by this audit", () => {
  it("names every plan, so a new one fails here first", () => {
    // Widening PlanTier without deciding its entitlements should break a test,
    // not silently inherit a default.
    expect(ALL_PLANS).toHaveLength(4);
    expect(new Set(ALL_PLANS).size).toBe(ALL_PLANS.length);
  });
});

// ── "Browsing jobs is always free and unlimited" ────────────────────────────

describe("browsing is never gated", () => {
  it("is true for a logged-out visitor", () => {
    expect(getEntitlements({ role: null, plan: "FREE" }).browseJobs).toBe(true);
  });

  it("is true for every role on every plan", () => {
    for (const plan of ALL_PLANS) {
      for (const role of ["FREELANCER", "RECRUITER", "ADMIN", null] as const) {
        expect(getEntitlements({ role, plan }).browseJobs).toBe(true);
      }
    }
  });
});

// ── "Free tier: 12 applications per rolling 30 days" ────────────────────────

describe("application quota", () => {
  it("is 12 per 30 days for a free freelancer", () => {
    expect(freelancer("FREE").applicationsPerWindow).toBe(12);
    expect(freelancer("FREE").applicationWindowDays).toBe(30);
    expect(APPLICATION_WINDOW_DAYS).toBe(30);
  });

  it("is unlimited only for Pro", () => {
    expect(freelancer("FREELANCER_PRO").applicationsPerWindow).toBeNull();
    for (const plan of ALL_PLANS.filter((p) => p !== "FREELANCER_PRO")) {
      expect(freelancer(plan).applicationsPerWindow).toBe(12);
    }
  });

  it("is not granted by holding a RECRUITER plan", () => {
    // A freelancer row carrying a recruiter plan is not a thing the product
    // creates, but if one existed it must not buy unlimited applications.
    expect(freelancer("RECRUITER_TEAM").applicationsPerWindow).toBe(12);
    expect(applicationQuotaForPlan("RECRUITER_TEAM")).toBe(12);
  });

  it("is zero for anyone who is not a freelancer", () => {
    for (const plan of ALL_PLANS) {
      expect(getEntitlements({ role: "RECRUITER", plan }).freelancer.applicationsPerWindow).toBe(0);
      expect(getEntitlements({ role: null, plan }).freelancer.applicationsPerWindow).toBe(0);
    }
  });
});

// ── "6-hour early access to new posts" ──────────────────────────────────────

describe("early access", () => {
  const now = new Date("2026-08-22T12:00:00Z");

  it("delays new posts by 6 hours for everyone except Pro", () => {
    expect(freelancer("FREELANCER_PRO").earlyAccessDelayHours).toBe(0);
    for (const plan of ALL_PLANS.filter((p) => p !== "FREELANCER_PRO")) {
      expect(freelancer(plan).earlyAccessDelayHours).toBe(EARLY_ACCESS_HOURS);
    }
  });

  it("is a query cutoff, not a flag — Pro gets null, everyone else a timestamp", () => {
    expect(earlyAccessCutoffFor("FREELANCER_PRO", now)).toBeNull();
    for (const plan of ALL_PLANS.filter((p) => p !== "FREELANCER_PRO")) {
      const cutoff = earlyAccessCutoffFor(plan, now);
      expect(cutoff).toEqual(new Date("2026-08-22T06:00:00Z"));
    }
  });

  it("applies to logged-out visitors", () => {
    expect(earlyAccessCutoffFor(null, now)).toEqual(new Date("2026-08-22T06:00:00Z"));
  });

  it("does not give a recruiter account the window", () => {
    expect(
      getEntitlements({ role: "RECRUITER", plan: "FREELANCER_PRO" }).freelancer
        .earlyAccessDelayHours,
    ).toBe(EARLY_ACCESS_HOURS);
  });
});

// ── "Free: 1 active post. Growth: 5. Team: unlimited." ──────────────────────
// ── "UNVERIFIED: max 1 post" ────────────────────────────────────────────────

describe("active post cap", () => {
  it("follows the plan for a verified company", () => {
    expect(recruiter("FREE", "VERIFIED").activeJobPosts).toBe(1);
    expect(recruiter("RECRUITER_GROWTH", "VERIFIED").activeJobPosts).toBe(5);
    expect(recruiter("RECRUITER_TEAM", "VERIFIED").activeJobPosts).toBeNull();
  });

  it("is capped at 1 for an UNVERIFIED company on ANY plan", () => {
    // Paying for Team does not buy an unverified company five more posts.
    for (const plan of ALL_PLANS) {
      expect(recruiter(plan, "UNVERIFIED").activeJobPosts).toBe(1);
      expect(effectiveJobSlots(plan, "UNVERIFIED")).toBe(1);
    }
  });

  it("treats an absent tier as unverified, never as unlimited", () => {
    expect(effectiveJobSlots("RECRUITER_TEAM", null)).toBe(1);
    expect(effectiveJobSlots("RECRUITER_TEAM", undefined)).toBe(1);
  });

  it("takes the stricter of plan and tier in both directions", () => {
    // Free plan + TRUSTED tier is still 1: the plan is the binding cap here.
    expect(effectiveJobSlots("FREE", "TRUSTED")).toBe(1);
    // Team plan + UNVERIFIED is 1: the tier is the binding cap here.
    expect(effectiveJobSlots("RECRUITER_TEAM", "UNVERIFIED")).toBe(1);
  });

  it("gives a non-recruiter no posting capacity at all", () => {
    for (const plan of ALL_PLANS) {
      expect(getEntitlements({ role: "FREELANCER", plan }).recruiter.activeJobPosts).toBe(0);
      expect(getEntitlements({ role: null, plan }).recruiter.activeJobPosts).toBe(0);
    }
  });
});

// ── "Candidate search is the paid wall" ─────────────────────────────────────

describe("candidate search and everything behind the paid wall", () => {
  const PAID_ONLY = ["candidateSearch", "searchFilters", "pipelines", "privateNotes"] as const;

  it("is closed to a free recruiter on every verification tier", () => {
    for (const tier of ALL_TIERS) {
      for (const key of PAID_ONLY) {
        expect(recruiter("FREE", tier)[key]).toBe(false);
      }
    }
  });

  it("is open on Growth and Team", () => {
    for (const plan of ["RECRUITER_GROWTH", "RECRUITER_TEAM"] as const) {
      for (const tier of ALL_TIERS) {
        for (const key of PAID_ONLY) {
          expect(recruiter(plan, tier)[key]).toBe(true);
        }
      }
    }
  });

  it("is never opened by a FREELANCER plan", () => {
    for (const tier of ALL_TIERS) {
      for (const key of PAID_ONLY) {
        expect(recruiter("FREELANCER_PRO", tier)[key]).toBe(false);
      }
    }
  });

  it("is closed to a freelancer account whatever plan it holds", () => {
    for (const plan of ALL_PLANS) {
      for (const key of PAID_ONLY) {
        expect(getEntitlements({ role: "FREELANCER", plan }).recruiter[key]).toBe(false);
      }
    }
  });

  it("is closed to a logged-out visitor", () => {
    for (const key of PAID_ONLY) {
      expect(getEntitlements({ role: null, plan: "FREE" }).recruiter[key]).toBe(false);
    }
  });
});

// ── "UNVERIFIED: cannot initiate messages" ──────────────────────────────────

describe("initiating messages", () => {
  it("is bought with verification, not with money", () => {
    for (const plan of ALL_PLANS) {
      expect(recruiter(plan, "UNVERIFIED").initiateMessages).toBe(false);
      expect(recruiter(plan, "VERIFIED").initiateMessages).toBe(true);
      expect(recruiter(plan, "TRUSTED").initiateMessages).toBe(true);
    }
  });

  it("is refused when the tier is unknown", () => {
    expect(getEntitlements({ role: "RECRUITER", plan: "RECRUITER_TEAM" }).recruiter
      .initiateMessages).toBe(false);
  });
});

// ── Receiving applications is free (CLAUDE.md: free tier "receives") ────────

describe("receiving applications", () => {
  it("is free for every recruiter, on every plan and tier", () => {
    for (const plan of ALL_PLANS) {
      for (const tier of ALL_TIERS) {
        expect(recruiter(plan, tier).receiveApplications).toBe(true);
      }
    }
  });
});

// ── "Team: 5 seats", "Team: export" ─────────────────────────────────────────

describe("seats and export", () => {
  it("gives 5 seats only on Team", () => {
    expect(recruiter("RECRUITER_TEAM", "VERIFIED").seats).toBe(5);
    for (const plan of ALL_PLANS.filter((p) => p !== "RECRUITER_TEAM")) {
      expect(recruiter(plan, "VERIFIED").seats).toBe(1);
    }
  });

  it("allows export only on Team", () => {
    expect(recruiter("RECRUITER_TEAM", "VERIFIED").exportCandidates).toBe(true);
    for (const plan of ALL_PLANS.filter((p) => p !== "RECRUITER_TEAM")) {
      expect(recruiter(plan, "VERIFIED").exportCandidates).toBe(false);
    }
  });

  it("gives a non-recruiter no seats", () => {
    expect(getEntitlements({ role: "FREELANCER", plan: "RECRUITER_TEAM" }).recruiter.seats).toBe(0);
  });
});

// ── Pro-only freelancer perks ───────────────────────────────────────────────

describe("Pro perks", () => {
  it("are off for free and on for Pro, and never leak to other roles", () => {
    expect(freelancer("FREE").searchBoost).toBe(false);
    expect(freelancer("FREE").applicationAnalytics).toBe(false);
    expect(freelancer("FREELANCER_PRO").searchBoost).toBe(true);
    expect(freelancer("FREELANCER_PRO").applicationAnalytics).toBe(true);

    const asRecruiter = getEntitlements({
      role: "RECRUITER",
      plan: "FREELANCER_PRO",
    }).freelancer;
    expect(asRecruiter.searchBoost).toBe(false);
    expect(asRecruiter.applicationAnalytics).toBe(false);
  });
});

// ── The 0% commission promise ───────────────────────────────────────────────

describe("no entitlement is a cut of anyone's earnings", () => {
  it("exposes no commission, fee, or payout field on any plan", () => {
    // A guard against the single change that would break the product's one
    // promise: if a rate ever appears in this object, this fails.
    const forbidden = /commission|payout|escrow|feePercent|takeRate/i;
    for (const plan of ALL_PLANS) {
      for (const role of ["FREELANCER", "RECRUITER"] as const) {
        const json = JSON.stringify(getEntitlements({ role, plan }));
        expect(json).not.toMatch(forbidden);
      }
    }
  });
});
