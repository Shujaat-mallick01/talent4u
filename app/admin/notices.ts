import type { JobNotice } from "../dashboard/recruiter/notices";

/** Admin outcomes as validated codes — never free text from the query string. */
export function resolveAdminNotice(
  code: string | undefined,
  jobs: string | undefined,
): JobNotice | null {
  const count = Number(jobs);
  const jobCount = Number.isInteger(count) && count >= 0 && count < 100000 ? count : 0;

  switch (code) {
    case "flag_cleared":
      return { tone: "success", message: "Flag cleared." };
    case "flag_cleared_published":
      return {
        tone: "success",
        message: "Flag cleared — the post was held before publication, so it is now live.",
      };
    case "flag_upheld":
      return { tone: "success", message: "Flag upheld. The post is removed from the site." };
    case "banned":
      return {
        tone: "success",
        message: `Employer banned and listed on the public removed-employers page. ${jobCount} ${jobCount === 1 ? "post" : "posts"} removed.`,
      };
    case "ban_reason_invalid":
      return {
        tone: "error",
        message:
          "The ban reason is published publicly — give 15 to 300 characters saying specifically what they did.",
      };
    case "report_upheld":
      return { tone: "success", message: "Report upheld." };
    case "report_cleared":
      return { tone: "success", message: "Report cleared." };
    case "verified":
      return { tone: "success", message: "Company verified. Their jobs now carry the badge." };
    case "verify_rejected":
      return { tone: "success", message: "Submission returned with your note." };
    case "verify_unmet":
      return {
        tone: "error",
        message:
          "That company no longer meets the requirements — their details changed after they submitted.",
      };
    case "verify_note_invalid":
      return {
        tone: "error",
        message: "Give the recruiter an actionable reason (10 to 1,000 characters).",
      };
    case "decision_failed":
      return {
        tone: "error",
        message: "That action didn't apply — someone may have handled it already.",
      };
    default:
      return null;
  }
}
