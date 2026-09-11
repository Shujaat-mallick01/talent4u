import type { FlagReason } from "@/lib/generated/prisma/enums";

import { scanTextForSafetyFlags, type SafetyMatch } from "./safety";

/**
 * Profile-side of the automated scanner.
 *
 * A company description and a freelancer bio are published, indexed prose that
 * sits beside every job card — the same surface a job description occupies, and
 * the same place the trigger categories in CLAUDE.md do their damage. Until
 * this existed they were the way round the job scanner: publish a clean post,
 * then move "a refundable deposit is required, contact us on Telegram" into the
 * company description, where it went live immediately with no flag.
 *
 * Refused, not held and not flagged-after — a third shape, and the reason is
 * that the other two do not fit:
 *
 *   A job is HELD because JobStatus has somewhere to hold it (PENDING_REVIEW,
 *   no publishedAt) and a held job hurts nobody while it waits. A profile has
 *   no such state: there is no column meaning "this company page is queued",
 *   and inventing one is a schema change.
 *
 *   A message is FLAGGED AFTER because it is already delivered by the time it
 *   is scanned. Profile prose has not gone anywhere yet, so there is nothing to
 *   be too late for.
 *
 * So the WRITE is refused and the previously-saved text — which was itself
 * scanned, or predates the scanner — stays live. That is "do not auto-publish"
 * expressed against the only state a profile has, and it is the same answer the
 * publish path gives a job: the text does not go out until it changes.
 *
 * The cost is that a moderator never learns someone tried. Recording the
 * attempt needs SafetyFlag to be able to point at a profile, which it cannot —
 * it has jobId and messageId and nothing else. That is a schema change and is
 * left for one.
 *
 * Fields are scanned one at a time rather than concatenated, so the caller can
 * put the error on the input that actually tripped instead of on the form.
 */

export type ProfileProseField = { field: string; text: string | null | undefined };

export type ProfileProseFlag = { field: string; match: SafetyMatch };

/**
 * The first field whose text trips the scanner, or null. Order matters only in
 * that the caller decides which input to highlight first; every field is
 * scanned with the same rules a job description gets.
 */
export function scanProfileProse(fields: ProfileProseField[]): ProfileProseFlag | null {
  for (const { field, text } of fields) {
    if (!text) continue;
    const match = scanTextForSafetyFlags(text);
    if (match) return { field, match };
  }
  return null;
}

/**
 * A noun phrase naming what was found, for the sentence the calling action
 * writes. A fragment rather than a whole message because each surface says it
 * differently — "your company description" is not "your bio" — and copy belongs
 * at the edge, not in a service.
 */
export function safetyReasonPhrase(reason: FlagReason): string {
  switch (reason) {
    case "UPFRONT_PAYMENT":
      return "asking someone to pay a fee or deposit";
    case "LONG_UNPAID_TEST":
      return "an unpaid test task longer than four hours";
    case "OFF_PLATFORM_PAYMENT":
      return "arranging payment through an outside app";
    default:
      return "something our safety checks do not allow";
  }
}
