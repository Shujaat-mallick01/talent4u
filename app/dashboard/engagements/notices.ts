import type { JobNotice } from "../recruiter/notices";

/**
 * Engagement outcomes as validated codes — never free text from the query
 * string. Shared by both role dashboards, which render the same flow.
 */
export function resolveEngagementNotice(code: string | undefined): JobNotice | null {
  switch (code) {
    case "too_fast":
      return {
        tone: "warning",
        message:
          "That is a lot of proposals in a short time. Wait a few minutes — every one you already sent went through.",
      };
    case "proposed":
      return {
        tone: "success",
        message:
          "Sent. It counts for nothing until the other side confirms it — reviews stay locked until then.",
      };
    case "confirmed":
      return {
        tone: "success",
        message: "Confirmed by both sides. You can each write one review of the other now.",
      };
    case "confirmed_trusted":
      return {
        tone: "success",
        // Says "third distinct freelancer", not "third engagement": the rule
        // counts DISTINCT freelancers, so three engagements with one person
        // does not qualify and this may be their tenth engagement overall.
        message:
          "Confirmed by both sides. That was this company's third confirmed engagement with a distinct freelancer — they are now Trusted.",
      };
    case "declined":
      return {
        tone: "success",
        message:
          "Declined. It stays on record between the two of you, and the same claim cannot be filed again.",
      };
    case "amended":
      return { tone: "success", message: "Terms updated. The other side sees the new figures." };
    case "reviewed":
      return { tone: "success", message: "Review published on their public profile." };
    case "already_exists":
      return {
        tone: "error",
        message:
          "There is already an engagement for that job and person — look for it in the list below.",
      };
    case "not_pending":
      return {
        tone: "error",
        message: "That is no longer open to answer — the other side may have acted already.",
      };
    case "already_confirmed":
      return { tone: "error", message: "You have already confirmed this one." };
    case "not_confirmed":
      return {
        tone: "error",
        message:
          "Reviews unlock only once both sides confirm the engagement. This one is not confirmed.",
      };
    case "already_reviewed":
      return { tone: "error", message: "You have already reviewed this engagement. One each." };
    case "terms_changed":
      return {
        tone: "error",
        message:
          "The rate or duration changed after this page loaded, so nothing was confirmed. Read the figures again below — you are agreeing to those exact numbers.",
      };
    case "terms_missing":
      return {
        tone: "error",
        message:
          "That engagement has no stated rate and duration, so there is nothing to confirm. The side that filed it can add the figures with “Correct the figures”.",
      };
    case "recruiter_banned":
      return {
        tone: "error",
        message: "That employer has been removed from Talent4u, so this cannot go ahead.",
      };
    case "terms_invalid":
      return {
        tone: "error",
        message: "Give the agreed rate in whole dollars and the duration in whole weeks.",
      };
    case "review_invalid":
      return {
        tone: "error",
        message:
          "Choose 1 to 5 stars and write at least 40 characters about working together.",
      };
    case "failed":
      return {
        tone: "error",
        message: "That didn't apply — reload the page and check the current state.",
      };
    default:
      return null;
  }
}
