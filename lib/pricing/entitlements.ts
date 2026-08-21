import type { PlanTier, RecruiterTier, UserRole } from "@/lib/generated/prisma/enums";

import {
  APPLICATION_WINDOW_DAYS,
  EARLY_ACCESS_HOURS,
  applicationQuotaForPlan,
  jobSlotsForPlan,
} from "./plans";

/**
 * What a given account may actually do. One pure function, so every gate in
 * the app answers the question the same way and the whole matrix is testable
 * without a database.
 *
 * CLAUDE.md: "Every authorization check happens server-side. UI gating is
 * cosmetic only." Nothing here authorizes anything by itself — services still
 * enforce their own rules. This exists so that the UI and the services are
 * reading one description of the plans instead of two.
 *
 * Two inputs, not one. A capability can be limited by the PLAN (what they pay
 * for) or by the VERIFICATION TIER (what we have confirmed about them), and
 * the effective answer is the stricter of the two. An UNVERIFIED company on
 * the Team plan still gets one post, because CLAUDE.md's verification table
 * says UNVERIFIED means "Max 1 post. Cannot initiate messages" and says
 * nothing about paying your way out of it.
 */

export type EntitlementSubject = {
  /** null for a logged-out visitor. */
  role: UserRole | null;
  plan: PlanTier;
  /** Recruiters only; ignored for every other role. */
  recruiterTier?: RecruiterTier | null;
};

export type Entitlements = {
  role: UserRole | null;
  plan: PlanTier;

  /**
   * CLAUDE.md: "Browsing jobs is always free and unlimited, including for
   * logged-out visitors. Job pages are SEO surface — never gate them."
   * Constant true, stated rather than assumed so a future gate has to delete
   * a line that says it is a rule.
   */
  browseJobs: true;

  freelancer: {
    /** Applications per rolling window; null = unlimited (Pro). */
    applicationsPerWindow: number | null;
    applicationWindowDays: number;
    /**
     * Hours a new post stays invisible to this viewer. 0 = they see posts the
     * moment they are published, which is what Pro buys.
     */
    earlyAccessDelayHours: number;
    searchBoost: boolean;
    applicationAnalytics: boolean;
  };

  recruiter: {
    /** Concurrent ACTIVE/PENDING_REVIEW posts; null = unlimited. */
    activeJobPosts: number | null;
    /** The paid wall. CLAUDE.md: free recruiters never reach search. */
    candidateSearch: boolean;
    searchFilters: boolean;
    pipelines: boolean;
    privateNotes: boolean;
    /** UNVERIFIED companies may reply but never start a conversation. */
    initiateMessages: boolean;
    receiveApplications: boolean;
    seats: number;
    companyPage: boolean;
    exportCandidates: boolean;
  };
};

const isRecruiterPlan = (plan: PlanTier): boolean =>
  plan === "RECRUITER_GROWTH" || plan === "RECRUITER_TEAM";

/** The stricter of two caps, where null means "no cap". */
const strictest = (a: number | null, b: number | null): number | null => {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
};

/**
 * The post cap the VERIFICATION tier imposes, independent of the plan.
 * CLAUDE.md's tier table: UNVERIFIED = "Max 1 post".
 */
export function jobSlotsForTier(tier: RecruiterTier | null | undefined): number | null {
  return tier === "VERIFIED" || tier === "TRUSTED" ? null : 1;
}

/**
 * The effective post cap: plan and tier both apply, stricter wins. Paying for
 * Team does not buy an unverified company five more posts.
 */
export function effectiveJobSlots(
  plan: PlanTier,
  tier: RecruiterTier | null | undefined,
): number | null {
  return strictest(jobSlotsForPlan(plan), jobSlotsForTier(tier));
}

export function seatsForPlan(plan: PlanTier): number {
  return plan === "RECRUITER_TEAM" ? 5 : 1;
}

export function getEntitlements(subject: EntitlementSubject): Entitlements {
  const { role, plan } = subject;
  const tier = subject.recruiterTier ?? null;

  const isFreelancer = role === "FREELANCER";
  const isRecruiter = role === "RECRUITER";
  // Only an active Pro plan clears the early-access window, and only for a
  // freelancer — a recruiter holding a FREELANCER_PRO row is not a thing the
  // product creates, and would not earn the window if it were.
  const isPro = isFreelancer && plan === "FREELANCER_PRO";
  const paidRecruiter = isRecruiter && isRecruiterPlan(plan);

  return {
    role,
    plan,
    browseJobs: true,

    freelancer: {
      applicationsPerWindow: isFreelancer ? applicationQuotaForPlan(plan) : 0,
      applicationWindowDays: APPLICATION_WINDOW_DAYS,
      earlyAccessDelayHours: isPro ? 0 : EARLY_ACCESS_HOURS,
      searchBoost: isPro,
      applicationAnalytics: isPro,
    },

    recruiter: {
      activeJobPosts: isRecruiter ? effectiveJobSlots(plan, tier) : 0,
      candidateSearch: paidRecruiter,
      searchFilters: paidRecruiter,
      pipelines: paidRecruiter,
      privateNotes: paidRecruiter,
      // Independent of the plan: this one is bought with verification, not money.
      initiateMessages: isRecruiter && tier !== "UNVERIFIED" && tier !== null,
      receiveApplications: isRecruiter,
      seats: isRecruiter ? seatsForPlan(plan) : 0,
      // Every recruiter, on every plan. CLAUDE.md lists "company page" under
      // Team, but /companies/[slug] has been public and ungated since Phase 2
      // and is indexed SEO surface — putting it behind a plan would take a
      // page away from companies that already have one and delete indexed
      // URLs. Advertising it as Team-only would also have told a paying
      // Growth customer they lack something they have had all along.
      // OPEN QUESTION for the product owner: decide what Team's company page
      // adds ON TOP of the free one (branding, pinned roles, all-roles
      // listing). That increment becomes its own field and its own gate.
      companyPage: isRecruiter,
      exportCandidates: isRecruiter && plan === "RECRUITER_TEAM",
    },
  };
}

/**
 * The entitlements a plan advertises, ignoring who is asking — what the
 * pricing page puts in each column.
 *
 * The role is explicit rather than inferred from the plan, because FREE is
 * both the free freelancer plan and the free recruiter plan and they are not
 * the same offer. Assumes a verified company: the tier restrictions describe
 * the account, not what the plan includes.
 */
export function advertisedEntitlements(
  role: Extract<UserRole, "FREELANCER" | "RECRUITER">,
  plan: PlanTier,
): Entitlements {
  return getEntitlements({ role, plan, recruiterTier: "VERIFIED" });
}
