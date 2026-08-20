import { z } from "zod";

/**
 * Apply-to-job input. Server-trusted authority — the form mirrors these for
 * UX only. The quota itself is NOT validated here: it needs the database and
 * is enforced in the service layer under a row lock (lib/db/application.ts).
 */
export const applyToJobSchema = z.object({
  coverLetter: z
    .string()
    .trim()
    .min(80, "Write a real cover letter — at least 80 characters. Generic notes get skipped.")
    .max(3000, "Keep it under 3,000 characters."),
  proposedRateUsd: z
    .number({ error: "Enter a whole-dollar rate." })
    .int("Enter a whole-dollar rate.")
    .positive("Your rate must be greater than zero.")
    .max(100000, "That rate looks too high.")
    .nullable()
    .default(null),
});

export type ApplyToJobInput = z.infer<typeof applyToJobSchema>;

/** Private recruiter note (Growth+). Empty collapses to null (= clear it). */
export const recruiterNoteSchema = z
  .string()
  .trim()
  .max(2000, "Keep notes under 2,000 characters.")
  .transform((v) => (v === "" ? null : v));

/** Recruiter-initiated decisions — the only statuses an action may request. */
export const applicationDecisionSchema = z.enum(["SHORTLISTED", "REJECTED"]);
