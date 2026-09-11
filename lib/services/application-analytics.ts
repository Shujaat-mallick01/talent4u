import { getApplicationOutcomeStats, type ApplicationOutcomeStats } from "@/lib/db/application";
import { getEntitlementContext, getFreelancerProfileByUserId } from "@/lib/db/users";
import { getEntitlements } from "@/lib/pricing/entitlements";

/**
 * The Pro freelancer's application analytics.
 *
 * This existed on the pricing page and nowhere else: `applicationAnalytics`
 * was an entitlement with no feature behind it, sold since Phase 5.
 *
 * What it deliberately does NOT do is flatter. The numbers a freelancer needs
 * are the ones that tell them whether to keep applying or to change something,
 * and that means:
 *
 *   - "Viewed" is reported but never called a response. A recruiter opening an
 *     inbox is our UI firing a timestamp, not somebody considering you. Shown
 *     because the gap between viewed and answered is the actionable part — a
 *     high viewed / low answered rate is a cover-letter problem, while low
 *     viewed is a profile-or-targeting problem, and those have different fixes.
 *
 *   - "Heard back" uses the SAME definition as the platform metric
 *     (freelancersWhoHeardBack): a decision, or a message from someone else.
 *     If those two numbers ever disagreed, one of them would be a lie and
 *     nobody could say which.
 *
 *   - The median is over applications that actually got a response. A median
 *     that counted silence as "infinity" would be unreadable, and one that
 *     counted it as zero would be a fraud.
 *
 * No comparison against a platform average, on purpose. It would need a second
 * query per view, and "you are below average" is not an action — it is a
 * reason to close the tab.
 */

export type ApplicationAnalytics = ApplicationOutcomeStats & {
  /** Percentages, rounded, or null when there is nothing to divide by. */
  viewedPercent: number | null;
  heardBackPercent: number | null;
};

export type ApplicationAnalyticsResult =
  | { ok: true; analytics: ApplicationAnalytics }
  | { ok: false; reason: "not-freelancer" | "no-profile" | "plan-required" };

const percentOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 100);

export async function getApplicationAnalyticsForUser(
  userId: string,
): Promise<ApplicationAnalyticsResult> {
  const context = await getEntitlementContext(userId);
  if (!context || context.role !== "FREELANCER") return { ok: false, reason: "not-freelancer" };

  const entitlements = getEntitlements({ role: context.role, plan: context.plan });
  // The gate. Nothing below this line runs for a free account — the panel is
  // an upsell for them, and the numbers are never computed.
  if (!entitlements.freelancer.applicationAnalytics) {
    return { ok: false, reason: "plan-required" };
  }

  const profile = await getFreelancerProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-profile" };

  const stats = await getApplicationOutcomeStats({ freelancerId: profile.id, userId });

  return {
    ok: true,
    analytics: {
      ...stats,
      viewedPercent: percentOf(stats.viewed, stats.sent),
      heardBackPercent: percentOf(stats.heardBack, stats.sent),
    },
  };
}
