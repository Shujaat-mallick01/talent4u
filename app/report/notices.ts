import type { NoticeTone } from "@/components/ui/notice";

/**
 * Report outcomes as validated codes — never free text from the URL. The job
 * and company pages share one ?notice= parameter with other flows, so an
 * unrecognised code resolves to null here and whatever owns it renders it.
 */

export type ReportNotice = { tone: NoticeTone; message: string };

export function resolveReportNotice(code: string | undefined): ReportNotice | null {
  switch (code) {
    case "reported":
      return {
        tone: "success",
        message:
          "Report sent. A person reads every one, and we never tell the company who reported them. You will not hear back unless we need something from you.",
      };
    case "report_invalid":
      return {
        tone: "error",
        message: "Pick a reason, and keep what you add under 2,000 characters.",
      };
    case "report_gone":
      return {
        tone: "info",
        message:
          "That post or company is no longer listed, so there is nothing left to report. If you can still see it, reload the page and try again.",
      };
    case "report_duplicate":
      return {
        tone: "info",
        message:
          "You already reported this and it is still open. A second report does not move it up the queue — it is with a moderator.",
      };
    case "report_too_fast":
      return {
        tone: "warning",
        message:
          "That is a lot of reports in a short time. Wait a few minutes and send the rest — nothing you already submitted has been lost.",
      };
    case "report_limit":
      return {
        tone: "warning",
        message:
          "You have five reports open. We work through them in order; once one is closed you can send another.",
      };
    case "report_failed":
      return { tone: "error", message: "That didn't send. Reload the page and try again." };
    default:
      return null;
  }
}
