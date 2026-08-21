import type { PlanTier } from "@/lib/generated/prisma/enums";

import { advertisedEntitlements } from "./entitlements";
import { formatMonthly, priceFor, type Price } from "./prices";
import type { PriceBand } from "./bands";

/**
 * The plans as a person reads them: name, who it is for, and what it includes.
 *
 * Every feature line is derived from the entitlements object rather than typed
 * out again, so the pricing page cannot drift from what the code enforces. If
 * a cap changes in plans.ts, the marketing copy changes with it.
 */

export type PlanAudience = "FREELANCER" | "RECRUITER";

export type PlanCopy = {
  plan: PlanTier;
  audience: PlanAudience;
  name: string;
  /** One line under the name. */
  tagline: string;
};

export const PLAN_COPY: Record<PlanTier, PlanCopy> = {
  FREE: {
    plan: "FREE",
    audience: "FREELANCER",
    name: "Free",
    tagline: "Browse and apply. No card, no trial clock.",
  },
  FREELANCER_PRO: {
    plan: "FREELANCER_PRO",
    audience: "FREELANCER",
    name: "Pro",
    tagline: "For people applying seriously, every week.",
  },
  RECRUITER_GROWTH: {
    plan: "RECRUITER_GROWTH",
    audience: "RECRUITER",
    name: "Growth",
    tagline: "For companies hiring more than occasionally.",
  },
  RECRUITER_TEAM: {
    plan: "RECRUITER_TEAM",
    audience: "RECRUITER",
    name: "Team",
    tagline: "For hiring teams running several roles at once.",
  },
};

/** The free recruiter offer. FREE is one plan row but two different products. */
export const RECRUITER_FREE_COPY: PlanCopy = {
  plan: "FREE",
  audience: "RECRUITER",
  name: "Free",
  tagline: "Post one role and receive applications.",
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const cap = (value: number | null, one: string, many: string): string =>
  value === null ? `Unlimited ${many}` : `${value} ${plural(value, one, many)}`;

/**
 * The feature lines for one plan, read off the entitlements it grants.
 * `included: false` lines are shown struck through or muted — CLAUDE.md wants
 * the paid wall visible, not hidden.
 */
export type FeatureLine = { label: string; included: boolean };

export function featuresFor(audience: PlanAudience, plan: PlanTier): FeatureLine[] {
  const e = advertisedEntitlements(audience, plan);

  if (audience === "FREELANCER") {
    const quota = e.freelancer.applicationsPerWindow;
    return [
      { label: "Browse every job, always free", included: true },
      {
        label:
          quota === null
            ? "Unlimited applications"
            : `${quota} applications per ${e.freelancer.applicationWindowDays} days`,
        included: true,
      },
      {
        label:
          e.freelancer.earlyAccessDelayHours === 0
            ? "See new jobs the moment they are posted"
            : `New jobs after ${e.freelancer.earlyAccessDelayHours} hours`,
        included: e.freelancer.earlyAccessDelayHours === 0,
      },
      { label: "Search boost on your profile", included: e.freelancer.searchBoost },
      { label: "Application analytics", included: e.freelancer.applicationAnalytics },
      { label: "0% commission — you keep 100% of what you earn", included: true },
    ];
  }

  return [
    { label: cap(e.recruiter.activeJobPosts, "active job post", "active job posts"), included: true },
    { label: "Receive applications and reply", included: e.recruiter.receiveApplications },
    { label: "Candidate search", included: e.recruiter.candidateSearch },
    { label: "Search filters and pipelines", included: e.recruiter.pipelines },
    { label: "Private notes on applicants", included: e.recruiter.privateNotes },
    { label: `${e.recruiter.seats} ${plural(e.recruiter.seats, "seat", "seats")}`, included: true },
    { label: "Public company page", included: e.recruiter.companyPage },
    { label: "Export candidates", included: e.recruiter.exportCandidates },
    { label: "0% commission on anyone's earnings", included: true },
  ];
}

export type PlanCard = {
  copy: PlanCopy;
  price: Price;
  listPrice: Price;
  monthly: string;
  features: FeatureLine[];
};

export function planCard(copy: PlanCopy, band: PriceBand): PlanCard {
  const price = priceFor(copy.plan, band);
  return {
    copy,
    price,
    listPrice: priceFor(copy.plan, "STANDARD"),
    monthly: formatMonthly(price),
    features: featuresFor(copy.audience, copy.plan),
  };
}

export function freelancerPlanCards(band: PriceBand): PlanCard[] {
  return [PLAN_COPY.FREE, PLAN_COPY.FREELANCER_PRO].map((copy) => planCard(copy, band));
}

export function recruiterPlanCards(band: PriceBand): PlanCard[] {
  return [RECRUITER_FREE_COPY, PLAN_COPY.RECRUITER_GROWTH, PLAN_COPY.RECRUITER_TEAM].map((copy) =>
    planCard(copy, band),
  );
}

/**
 * The one-line upsell used wherever a free user hits a limit. Reads the price
 * from config so no component ever writes "$6/mo" itself.
 */
export function upsellLine(plan: PlanTier, band: PriceBand): string {
  const copy = plan === "FREE" ? RECRUITER_FREE_COPY : PLAN_COPY[plan];
  return `${copy.name} (${formatMonthly(priceFor(plan, band))})`;
}
