import { z } from "zod";

import { COUNTRY_CODES } from "@/lib/geo/countries";
import { optionalHostUrl, optionalHttpsUrl } from "./url";

/**
 * Freelancer onboarding input. This is the authority on what a valid profile
 * submission is — the form mirrors these rules for UX, but the server trusts
 * only what this schema accepts, because the caller may be curl.
 */

export const freelancerSkillSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid skill."),
  // Years of experience with this skill. Optional; when given, sane bounds.
  yearsExp: z.number().int().min(0).max(60).nullable().default(null),
});

export const freelancerOnboardingSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(80, "That name is too long."),
  headline: z
    .string()
    .trim()
    .min(10, "Write a short headline (at least 10 characters).")
    .max(120, "Keep your headline under 120 characters."),
  bio: z
    .string()
    .trim()
    .min(120, "Tell clients about yourself — at least 120 characters.")
    .max(4000, "That bio is too long (max 4000 characters)."),
  country: z
    .string()
    .trim()
    .refine((v) => COUNTRY_CODES.has(v), "Select your country from the list."),
  timezone: z
    .string()
    .trim()
    .min(1, "Select your timezone.")
    .refine(isValidTimezone, "Select your timezone from the list."),
  hourlyRateUsd: z
    .number({ error: "Enter a whole-dollar rate." })
    .int("Enter a whole-dollar rate.")
    .positive("Your rate must be greater than zero.")
    .max(10000, "That rate looks too high.")
    .nullable()
    .default(null),
  isOpenToWork: z.boolean().default(true),
  skills: z
    .array(freelancerSkillSchema)
    .min(1, "Choose at least one skill.")
    .max(20, "Choose up to 20 skills.")
    .refine(
      (skills) => new Set(skills.map((s) => s.slug)).size === skills.length,
      "You selected the same skill twice.",
    ),
  githubUrl: optionalHostUrl("github.com", "Enter a valid GitHub URL (https://github.com/…)."),
  portfolioUrl: optionalHttpsUrl("Enter a valid https:// portfolio URL."),
  linkedinUrl: optionalHostUrl(
    "linkedin.com",
    "Enter a valid LinkedIn URL (https://linkedin.com/…).",
  ),
});

export type FreelancerOnboardingInput = z.infer<typeof freelancerOnboardingSchema>;

/** True when the runtime's Intl database recognizes this IANA timezone. */
export function isValidTimezone(tz: string): boolean {
  try {
    // Throws RangeError on an unknown zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
