import { z } from "zod";

import type { FlagReason } from "@/lib/generated/prisma/enums";

/**
 * User reports — the manual half of the safety system.
 *
 * The regex scanner (lib/services/safety.ts) catches the wording it knows.
 * Everything it misses — a job that simply does not exist, a company using
 * someone else's name, a payment demand phrased in a way nobody has seen yet —
 * reaches moderation only if a person can file it. This is that input.
 *
 * A reporter names a target and picks a reason. They never name a status, a
 * severity, or a decision: the queue decides, a human decides, and the reporter
 * is told nothing about the outcome beyond "a person will read this".
 */

export const REPORT_TARGET_TYPES = ["job", "company"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/**
 * The reasons a person can pick, in the words a person would use. These are
 * NOT the moderation vocabulary — see REPORT_REASON_TO_FLAG for the translation
 * into what the queue reads.
 */
export const REPORT_REASONS = [
  "asked-for-payment",
  "fake-job",
  "impersonation",
  "off-platform-scam",
  "other",
] as const;
export type ReportReasonKey = (typeof REPORT_REASONS)[number];

/** Radio labels. Sentence case, describing what happened to the reporter. */
export const REPORT_REASON_LABELS: Record<ReportReasonKey, string> = {
  "asked-for-payment":
    "They asked me to pay — a fee, a deposit, training, or equipment",
  "fake-job": "The job is not real, or the description is not what is on offer",
  impersonation: "They are using a company name that is not theirs",
  "off-platform-scam": "They pushed me to move money or pay off Talent4u",
  other: "Something else",
};

/**
 * What actually lands in Report.reason.
 *
 * Four of the five are the moderator's existing vocabulary — the FlagReason
 * values the automated scanner files under — so a reported post and a scanned
 * post sort under the same word in the queue and a moderator learns one set of
 * terms, not two.
 *
 * "impersonation" has no FlagReason. It is stored under its own name rather
 * than folded into SUSPECTED_SCAM (where it would be indistinguishable from
 * "fake-job") or OTHER (where it would be indistinguishable from nothing at
 * all). The distinction is the whole content of the report: "check whether
 * this company is who it says it is" is a different investigation from "check
 * whether this job exists". Report.reason is a String column, not the enum, so
 * carrying one extra word costs nothing.
 */
export const REPORT_REASON_TO_FLAG: Record<ReportReasonKey, FlagReason | "IMPERSONATION"> = {
  "asked-for-payment": "UPFRONT_PAYMENT",
  "fake-job": "SUSPECTED_SCAM",
  impersonation: "IMPERSONATION",
  "off-platform-scam": "OFF_PLATFORM_PAYMENT",
  other: "OTHER",
};

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES, {
    error: "Reports can name a job post or a company.",
  }),
  // Ids are cuids. The 40-character ceiling is the same bound isPlausibleId
  // applies before anything reaches Postgres.
  targetId: z.string().trim().min(1).max(40),
  reason: z.enum(REPORT_REASONS, { error: "Pick the reason that fits best." }),
  // Optional on purpose. Requiring an explanation would lose the reports from
  // the people least willing to write one, who are often the ones who were
  // actually targeted.
  details: z
    .string()
    .trim()
    .max(2000, "Keep it under 2,000 characters — a moderator only needs what you saw.")
    .optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;
