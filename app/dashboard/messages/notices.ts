import type { JobNotice } from "../recruiter/notices";

/** Messaging outcomes as validated codes — never free text from the URL. */
export function resolveMessageNotice(code: string | undefined): JobNotice | null {
  switch (code) {
    case "sent":
      return { tone: "success", message: "Sent." };
    case "sent_flagged":
      return {
        tone: "warning",
        message:
          "Sent — and flagged for review, because it matches a pattern we watch for. It was delivered; a moderator will look at it. If that seems wrong, it usually is: the wording just resembles a scam we see often.",
      };
    case "message_empty":
      return { tone: "error", message: "Write something first — an empty message is not sent." };
    case "cannot_initiate":
      return {
        tone: "error",
        message:
          "Companies we have not verified cannot start conversations. Get verified and you can write first; until then you can reply to anyone who writes to you.",
      };
    case "recruiter_banned":
      return {
        tone: "error",
        message: "That employer has been removed from Talent4u, so this thread is closed.",
      };
    case "not_found":
      return {
        tone: "error",
        message: "That conversation is not one of yours, or it no longer exists.",
      };
    case "not_allowed":
      return { tone: "error", message: "Finish setting up your profile to use messages." };
    case "failed":
      return { tone: "error", message: "That didn't send. Reload and try again." };
    default:
      return null;
  }
}
