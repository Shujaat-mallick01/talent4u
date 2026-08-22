import type { NoticeTone } from "@/components/ui/notice";

/**
 * Verification outcomes as validated codes — never free text from the query
 * string. Both sides of the flow resolve here: the freelancer's page and, for
 * the freelancer half of the moderation queue, the admin page.
 *
 * (The admin resolver lives here rather than in app/admin/notices.ts because
 * that file belongs to another workstream this sprint. It is a candidate to
 * move once the sprint lands — noted in the handover.)
 */

export type VerificationNotice = { tone: NoticeTone; message: string };

/**
 * The admin page renders notices through its own tone->class map, which has no
 * "info" entry, so the queue resolver is narrowed to the three tones that map.
 */
export type QueueNotice = { tone: "success" | "warning" | "error"; message: string };

/** Outcomes shown to the freelancer on /dashboard/freelancer/verification. */
export function resolveFreelancerVerificationNotice(
  code: string | undefined,
): VerificationNotice | null {
  switch (code) {
    case "submitted":
      return {
        tone: "success",
        message:
          "Sent for review. A person opens each link and checks it is yours and it is real — usually within a couple of days.",
      };
    case "no_work_links":
      return {
        tone: "error",
        message:
          "There is nothing to review yet. Add a GitHub, portfolio or LinkedIn link to your profile, then send it for review.",
      };
    case "already_pending":
      return {
        tone: "warning",
        message: "This is already in the review queue. Nothing to do on your side.",
      };
    case "already_reviewed":
      return {
        tone: "warning",
        message: "Your links have already been reviewed. The next step is ID verification.",
      };
    case "already_verified":
      return { tone: "warning", message: "You are already verified." };
    case "deactivated":
      return {
        tone: "error",
        message:
          "Your profile is deactivated, so there is no public page for a badge to appear on. Reactivate it, then send your links for review.",
      };
    case "failed":
      return {
        tone: "error",
        message: "That didn't send. Reload the page and try again.",
      };
    default:
      return null;
  }
}

/**
 * Outcomes shown to an ADMIN after deciding a freelancer submission. Kept
 * apart from the freelancer's codes so a code can never leak across and show a
 * reviewer's wording to the person being reviewed.
 */
export function resolveFreelancerQueueNotice(code: string | undefined): QueueNotice | null {
  switch (code) {
    case "fverify_approved":
      return {
        tone: "success",
        message:
          "Work links recorded as reviewed. Their badge does not change — that waits on ID verification.",
      };
    case "fverify_returned":
      return { tone: "success", message: "Submission returned with your note." };
    case "fverify_note_invalid":
      return {
        tone: "error",
        message:
          "Give the freelancer an actionable reason of 10 to 1,000 characters, and don't open it with “approved:” — that wording is reserved for approvals.",
      };
    case "fverify_unmet":
      return {
        tone: "error",
        message:
          "That profile has no work links any more — they were removed after it was submitted. Return it instead.",
      };
    default:
      return null;
  }
}
