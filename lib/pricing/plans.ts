import type { PlanTier } from "@/lib/generated/prisma/enums";

/**
 * Plan entitlements. This file is the single source of truth for what each
 * plan allows — Phase 5 expands it into the full lib/pricing config with
 * regional price bands; nothing outside lib/pricing may hardcode these.
 */

/**
 * How long a newly published job stays visible ONLY to Pro freelancers.
 * Implemented as a query filter on publishedAt (never a cron): non-Pro and
 * logged-out viewers see jobs where publishedAt <= now() - this many hours.
 */
export const EARLY_ACCESS_HOURS = 6;

/**
 * The publishedAt cutoff a viewer's browse query must apply, or null when
 * the viewer sees everything. Pure so the entitlement is unit-testable:
 * only an active FREELANCER_PRO plan clears the window.
 */
export function earlyAccessCutoffFor(plan: PlanTier | null, now: Date): Date | null {
  if (plan === "FREELANCER_PRO") return null;
  return new Date(now.getTime() - EARLY_ACCESS_HOURS * 60 * 60 * 1000);
}

/** The application quota's rolling window, in days. */
export const APPLICATION_WINDOW_DAYS = 30;

/**
 * How many applications a freelancer plan allows per rolling 30 days.
 * null = unlimited. CLAUDE.md: free tier 12 per rolling 30 days, Pro
 * unlimited. Withdrawal does NOT refund quota — every application ever
 * submitted inside the window counts, whatever its status.
 */
export function applicationQuotaForPlan(plan: PlanTier): number | null {
  return plan === "FREELANCER_PRO" ? null : 12;
}

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
