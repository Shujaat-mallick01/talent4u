import type { EngagementType } from "@/lib/generated/prisma/enums";

/**
 * schema.org JobPosting JSON-LD for the public job detail page. Built ONLY
 * for ACTIVE jobs — an expired/closed posting must not carry JobPosting
 * markup (Google treats that as a policy violation). Serialized with
 * jsonLdScript (lib/profile/jsonld.ts), which escapes markup-breaking chars.
 */

const EMPLOYMENT_TYPE: Record<EngagementType, string> = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  FIXED: "CONTRACTOR",
  HOURLY: "CONTRACTOR",
};

export type JobPostingJsonLdInput = {
  title: string;
  description: string;
  slug: string;
  url: string;
  datePosted: Date;
  engagementType: EngagementType;
  isRemote: boolean;
  location: string | null;
  /** Only meaningful as a salary for HOURLY engagements ($/hr). */
  budgetMinUsd: number | null;
  budgetMaxUsd: number | null;
  company: { name: string; url: string; logoUrl: string | null };
  /** Recruiter's country: display name (e.g. "Germany") for remote-eligibility,
   * ISO alpha-2 code (e.g. "DE") for the on-site postal address. The best
   * available job-site signal until jobs carry structured locations. */
  companyCountryName: string;
  companyCountryCode: string;
};

export function jobPostingJsonLd(input: JobPostingJsonLdInput): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: input.title,
    description: input.description,
    datePosted: input.datePosted.toISOString(),
    employmentType: EMPLOYMENT_TYPE[input.engagementType],
    identifier: { "@type": "PropertyValue", name: "Talent4u", value: input.slug },
    url: input.url,
    hiringOrganization: {
      "@type": "Organization",
      name: input.company.name,
      sameAs: input.company.url,
      ...(input.company.logoUrl ? { logo: input.company.logoUrl } : {}),
    },
  };

  if (input.isRemote) {
    ld.jobLocationType = "TELECOMMUTE";
    // TELECOMMUTE postings require at least one REAL country in
    // applicantLocationRequirements (Google rejects invented values like
    // "Anywhere"). The hiring organization's country is the documented floor;
    // a job-level eligible-countries field can widen this later.
    ld.applicantLocationRequirements = { "@type": "Country", name: input.companyCountryName };
  } else if (input.location) {
    ld.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        // Free-text "city, region" belongs in addressLocality, and
        // addressCountry is REQUIRED by Google for a valid jobLocation.
        addressLocality: input.location,
        addressCountry: input.companyCountryCode,
      },
    };
  }

  // Budgets are only unambiguously a salary for hourly engagements. Fixed and
  // full/part-time budgets are project- or period-scoped and omitted rather
  // than mislabeled.
  if (
    input.engagementType === "HOURLY" &&
    (input.budgetMinUsd !== null || input.budgetMaxUsd !== null)
  ) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: {
        "@type": "QuantitativeValue",
        ...(input.budgetMinUsd !== null ? { minValue: input.budgetMinUsd } : {}),
        ...(input.budgetMaxUsd !== null ? { maxValue: input.budgetMaxUsd } : {}),
        unitText: "HOUR",
      },
    };
  }

  return ld;
}

export type JobViewState = "full" | "closed" | "not-found";

/**
 * Whether a viewer may see a job's public page. Pure so every rule is
 * unit-tested:
 * - a banned recruiter's jobs are never rendered (bans normally transition
 *   jobs to REMOVED in the same transaction; this is defence in depth)
 * - CLOSED renders as an archived page (noindex, no JobPosting markup)
 * - only ACTIVE is public, and inside the early-access window it is only
 *   visible to viewers with a null cutoff (Pro) — "invisible to free-tier
 *   users" (CLAUDE.md) covers the detail page too, or sharing a URL would
 *   bypass the window
 */
export function decideJobVisibility(
  job: { status: string; publishedAt: Date | null; recruiterBanned: boolean },
  earlyAccessCutoff: Date | null,
): JobViewState {
  if (job.recruiterBanned) return "not-found";
  if (job.status === "CLOSED") return "closed";
  if (job.status !== "ACTIVE") return "not-found";
  if (job.publishedAt === null) return "not-found";
  if (earlyAccessCutoff && job.publishedAt > earlyAccessCutoff) return "not-found";
  return "full";
}
