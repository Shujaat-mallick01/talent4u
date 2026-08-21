import { getPublicStats } from "@/lib/db/stats";
import { APPLICATION_WINDOW_DAYS, EARLY_ACCESS_HOURS, applicationQuotaForPlan } from "@/lib/pricing/plans";

/**
 * The numbers the marketing surfaces are allowed to quote.
 *
 * BRANDGUIDE voice: "Numbers beat adjectives. '3 days' is stronger than
 * 'fast'." But a marketplace launches empty, and raw counts interpolated
 * straight into copy produce "Browse 0 open jobs" as the hero's primary
 * button — the most prominent element on the site announcing that it has
 * nothing. So counts are gated behind a floor, and below it we quote facts
 * that are true on day one and do not depend on supply.
 */

/** Below this, live counts are not persuasive and we stop quoting them. */
const MIN_JOBS_TO_QUOTE = 12;

const n = new Intl.NumberFormat("en-US");

export type ProofPoint = { label: string; value: string };

export type Proof = {
  /** True once there is enough real supply to lead with it. */
  hasSupply: boolean;
  activeJobs: number;
  /** "Browse 128 open jobs" or "Browse open jobs" — never "Browse 0 open jobs". */
  browseLabel: string;
  /** The ruled data panel: four points, always populated, always true. */
  points: ProofPoint[];
};

export async function getProof(): Promise<Proof> {
  const { activeJobs, freelancers, companies } = await getPublicStats();
  const hasSupply = activeJobs >= MIN_JOBS_TO_QUOTE;
  const freeQuota = applicationQuotaForPlan("FREE");

  // Structural facts first: these are the product's actual argument, they are
  // true with an empty database, and they are the things a competitor cannot
  // copy without changing their business model.
  const points: ProofPoint[] = [
    { label: "Commission we take", value: "0%" },
    {
      label: "Free applications",
      value: `${freeQuota ?? 12} / ${APPLICATION_WINDOW_DAYS} days`,
    },
    { label: "Pro early access", value: `${EARLY_ACCESS_HOURS} hours` },
  ];

  points.push(
    hasSupply
      ? { label: "Open roles", value: n.format(activeJobs) }
      : { label: "Card to sign up", value: "None" },
  );

  if (hasSupply && freelancers > 0) {
    points.splice(3, 0, { label: "Specialists", value: n.format(freelancers) });
  }
  if (hasSupply && companies > 0) {
    points.push({ label: "Companies hiring", value: n.format(companies) });
  }

  return {
    hasSupply,
    activeJobs,
    browseLabel: hasSupply ? `Browse ${n.format(activeJobs)} open jobs` : "Browse open jobs",
    points: points.slice(0, 4),
  };
}
