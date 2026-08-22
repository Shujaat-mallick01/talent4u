import { z } from "zod";

/**
 * Input validation for the freelancer work-link verification queue.
 *
 * The one rule with teeth here is the reserved-prefix refusal. Because the
 * schema is frozen this sprint, an approval is recorded as a canonical marker
 * inside `FreelancerProfile.verificationNote` (see lib/services/
 * freelancer-verification.ts), and the freelancer's page tells an approval
 * apart from a rejection by that marker's prefix. So a rejection note that
 * begins "approved:" would render a refusal as an acceptance. It is refused at
 * the edge here, and again in the service — a note is admin-authored free text
 * and this is the one place its content can change meaning.
 */

/** The prefix that marks a note as a decision RECORD rather than a reason. */
export const APPROVAL_NOTE_PREFIX = "approved:";

/** The exact note an approval writes. Nothing else may start with the prefix. */
export const WORK_LINKS_APPROVED_NOTE = `${APPROVAL_NOTE_PREFIX}work-links-approved`;

/** True when a stored note is the canonical approval marker, not a reason. */
export function isApprovalMarker(note: string | null | undefined): boolean {
  if (typeof note !== "string") return false;
  return note.trim().toLowerCase().startsWith(APPROVAL_NOTE_PREFIX);
}

/**
 * An admin's rejection reason, shown back to the freelancer. Same shape as the
 * recruiter note (lib/validations/recruiter.ts) plus the reserved-prefix rule;
 * kept separate rather than imported because only this queue reads notes as
 * markers, and the two must be free to diverge when ID verification lands.
 */
export const freelancerVerificationNoteSchema = z
  .string()
  .trim()
  .min(10, "Give the freelancer something actionable — at least 10 characters.")
  .max(1000, "Keep the reason under 1,000 characters.")
  .refine(
    (v) => !isApprovalMarker(v),
    "Start the note with something other than “approved:” — that wording is reserved for approvals and would show as one.",
  );

/**
 * A profile id arriving from a form. Matches isPlausibleId in
 * lib/services/slug.ts, so a malformed id is refused before it reaches Prisma.
 */
export const freelancerIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{1,40}$/i, "That is not a profile id.");
