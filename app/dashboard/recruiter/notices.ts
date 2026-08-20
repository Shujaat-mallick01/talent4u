/**
 * Dashboard notices, passed between actions and the page as validated codes —
 * never free text — so the query string cannot inject copy. The cap notice
 * carries numeric params, parsed defensively.
 */

export type JobNotice = { tone: "success" | "warning" | "error"; message: string };

/**
 * Brand-token classes per notice tone. Status colours are status-only and
 * flip automatically under .dark, so no dark: variants are needed.
 */
export const NOTICE_CLASSES: Record<JobNotice["tone"], string> = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : fallback;
};

export function resolveJobNotice(params: {
  notice?: string;
  cap?: string;
  used?: string;
}): JobNotice | null {
  switch (params.notice) {
    case "published":
      return { tone: "success", message: "Your job is live." };
    case "held_for_review":
      return {
        tone: "warning",
        message:
          "Your post was held for a quick human review because it matched one of our safety checks. It will go live once cleared — nothing to do on your side.",
      };
    case "draft_saved":
      return { tone: "success", message: "Draft saved. Publish it whenever you're ready." };
    case "draft_updated":
      return { tone: "success", message: "Draft updated." };
    case "cap_reached": {
      const cap = int(params.cap, 1);
      const used = int(params.used, cap);
      return {
        tone: "error",
        message: `Your plan allows ${cap} active ${cap === 1 ? "post" : "posts"} and you're using ${used}. Close a post or upgrade your plan, then publish from here.`,
      };
    }
    case "closed":
      return { tone: "success", message: "Job closed. It no longer accepts applications." };
    case "withdrawn":
      return {
        tone: "success",
        message:
          "Post withdrawn back to drafts and its slot freed. Edit it and publish again whenever you're ready — it will be re-checked on publish.",
      };
    case "publish_failed":
      return { tone: "error", message: "We couldn't publish that job. Try again." };
    case "not_found":
      return { tone: "error", message: "That job wasn't found, or it can't be changed right now." };
    case "banned":
      return {
        tone: "error",
        message: "This account can't post jobs. See our removed employers policy.",
      };
    default:
      return null;
  }
}

/** Notices for the per-job application inbox, as validated codes. */
export function resolveInboxNotice(notice: string | undefined): JobNotice | null {
  switch (notice) {
    case "shortlisted":
      return { tone: "success", message: "Application shortlisted." };
    case "rejected":
      return { tone: "success", message: "Application marked as not selected." };
    case "note_saved":
      return { tone: "success", message: "Note saved. Only your team ever sees notes." };
    case "note_too_long":
      return {
        tone: "error",
        message: "Notes are limited to 2,000 characters. Trim it and save again.",
      };
    case "note_plan_required":
      return {
        tone: "error",
        message:
          "Notes are part of the Growth plan ($79/mo) — along with candidate search and pipelines. Billing launches soon.",
      };
    case "decision_failed":
      return {
        tone: "error",
        message: "That change wasn't possible — the application may have been withdrawn.",
      };
    default:
      return null;
  }
}
