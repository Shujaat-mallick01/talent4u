import { z } from "zod";

import { freelancerOnboardingSchema } from "./freelancer";
import { recruiterOnboardingSchema } from "./recruiter";

/**
 * Profile editing input — what a person may change about themselves AFTER
 * onboarding.
 *
 * These schemas are picked out of the onboarding schemas rather than restated,
 * so a rule only ever exists in one place: raise the headline limit in
 * freelancer.ts and the editor moves with it. What the pick expresses is not
 * "the same fields again" but "which of those fields stay editable" — the
 * omissions are the content here.
 *
 * Two things are deliberately NOT in either schema:
 *
 *   slug — the public URL. A rename must not break the links, search results,
 *          and shared job applications that point at the old one, so the slug
 *          is set once at onboarding and never rewritten.
 *
 *   companyDomain / registrationNo / linkedinUrl — the three facts a VERIFIED
 *          badge is granted on. Editing them here would let a company swap the
 *          evidence out from under an approved badge. They stay editable only
 *          while UNVERIFIED, and only through the verification flow, which
 *          pulls any pending submission back out of the review queue when they
 *          change (lib/services/recruiter-verification.ts).
 */

/**
 * The editable half of a freelancer's public profile. Everything the
 * onboarding form collects is editable — a rate that can never be raised and a
 * typo that can never be fixed are the bugs this closes.
 */
export const freelancerProfileEditSchema = freelancerOnboardingSchema.pick({
  displayName: true,
  headline: true,
  bio: true,
  country: true,
  timezone: true,
  hourlyRateUsd: true,
  isOpenToWork: true,
  skills: true,
  githubUrl: true,
  portfolioUrl: true,
  linkedinUrl: true,
});

export type FreelancerProfileEditInput = z.infer<typeof freelancerProfileEditSchema>;

/**
 * The editable half of a company page. The pick is the freeze: the three
 * verification-evidence fields are absent, so an unknown-key strip removes
 * them from any submission that carries them — including a hand-rolled POST.
 */
export const companyProfileEditSchema = recruiterOnboardingSchema.pick({
  companyName: true,
  websiteUrl: true,
  description: true,
  country: true,
});

export type CompanyProfileEditInput = z.infer<typeof companyProfileEditSchema>;

/**
 * The evidence a recruiter tier is decided on. Named here so the service, the
 * page copy, and the tests all refer to the same list.
 */
export const VERIFICATION_EVIDENCE_FIELDS = [
  "companyDomain",
  "registrationNo",
  "linkedinUrl",
] as const;

/** Where those three fields ARE edited, while a company is still unverified. */
export const VERIFICATION_PAGE = "/dashboard/recruiter/verification";
