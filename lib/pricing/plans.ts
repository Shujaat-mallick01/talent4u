import type { PlanTier } from "@/lib/generated/prisma/enums";

/**
 * Plan entitlements. This file is the single source of truth for what each
 * plan allows — Phase 5 expands it into the full lib/pricing config with
 * regional price bands; nothing outside lib/pricing may hardcode these.
 */

/**
 * How many job-post slots a recruiter plan gets. A slot is occupied by an
 * ACTIVE or PENDING_REVIEW job (a flagged post awaiting review still holds
 * its slot, so the queue cannot be stuffed for free). null = unlimited.
 *
 * CLAUDE.md: Free = 1 active post, Growth = 5, Team = unlimited.
 */
export function jobSlotsForPlan(plan: PlanTier): number | null {
  switch (plan) {
    case "RECRUITER_TEAM":
      return null;
    case "RECRUITER_GROWTH":
      return 5;
    default:
      // FREE — and any plan that is not a recruiter plan.
      return 1;
  }
}
