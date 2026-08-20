import { z } from "zod";

import { COUNTRY_CODES } from "@/lib/geo/countries";
import { optionalHostUrl, optionalHttpsUrl } from "./url";

/**
 * Recruiter onboarding input. New recruiters are always created UNVERIFIED
 * (see lib/services/recruiter.ts) — collecting a domain/registration number
 * here does not verify anyone; that is the Phase 4 verification flow. This
 * schema is the server-trusted authority on a valid submission.
 */

// Company logo upload limits, shared by the schema, the form, and the
// storage layer so they never drift.
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_ACCEPT = LOGO_ALLOWED_TYPES.join(",");

// A bare domain like "acme.com". Accepts a pasted URL or a leading "www." and
// normalizes to the registrable hostname; empty collapses to null.
const optionalDomain = z
  .string()
  .trim()
  .transform((v) => {
    if (v === "") return null;
    let host = v;
    if (URL.canParse(v)) host = new URL(v).hostname;
    else if (URL.canParse(`https://${v}`)) host = new URL(`https://${v}`).hostname;
    return host.toLowerCase().replace(/^www\./, "");
  })
  .nullable()
  .refine((v) => {
    if (v === null) return true;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return false;
    // Reject IPv4 literals and numeric shorthand: a real TLD is never all
    // digits, and the WHATWG parser rewrites e.g. "123.456" -> "123.0.1.200".
    const lastLabel = v.slice(v.lastIndexOf(".") + 1);
    return !/^\d+$/.test(lastLabel);
  }, "Enter a valid company domain, like acme.com.");

const optionalText = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine((v) => v === null || (v.length >= min && v.length <= max), message);

export const recruiterOnboardingSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Enter your company name.")
    .max(100, "That company name is too long."),
  companyDomain: optionalDomain,
  registrationNo: optionalText(2, 50, "That registration number looks wrong."),
  linkedinUrl: optionalHostUrl(
    "linkedin.com",
    "Enter a valid LinkedIn URL (https://linkedin.com/…).",
  ),
  websiteUrl: optionalHttpsUrl("Enter a valid https:// website URL."),
  description: optionalText(
    40,
    2000,
    "Add a bit more detail (40–2000 characters) or leave it blank.",
  ),
  country: z
    .string()
    .trim()
    .refine((v) => COUNTRY_CODES.has(v), "Select your country from the list."),
});

export type RecruiterOnboardingInput = z.infer<typeof recruiterOnboardingSchema>;

/**
 * The three fields VERIFIED is decided on, editable after onboarding — a
 * recruiter who skipped them (they are optional there) or had a submission
 * returned must be able to fix them, or verification is unreachable.
 */
export const recruiterVerificationDetailsSchema = z.object({
  companyDomain: optionalDomain,
  registrationNo: optionalText(2, 50, "That registration number looks wrong."),
  linkedinUrl: optionalHostUrl(
    "linkedin.com",
    "Enter a valid LinkedIn URL (https://linkedin.com/…).",
  ),
});

export type RecruiterVerificationDetailsInput = z.infer<
  typeof recruiterVerificationDetailsSchema
>;

/** An admin's rejection reason, shown back to the recruiter. */
export const verificationNoteSchema = z
  .string()
  .trim()
  .min(10, "Give the recruiter something actionable — at least 10 characters.")
  .max(1000, "Keep the reason under 1,000 characters.");

export type LogoValidationResult =
  | { ok: true; file: File | null }
  | { ok: false; message: string };

/**
 * Validates the optional logo upload. A missing or empty file is a valid
 * "no logo". A present file must be an allowed image type within the size cap.
 * Kept separate from the Zod object because a File is not JSON-shaped.
 */
export function validateLogo(file: unknown): LogoValidationResult {
  if (!(file instanceof File) || file.size === 0) return { ok: true, file: null };
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Logo must be a PNG, JPEG, or WebP image." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, message: "Logo must be 2 MB or smaller." };
  }
  return { ok: true, file };
}
