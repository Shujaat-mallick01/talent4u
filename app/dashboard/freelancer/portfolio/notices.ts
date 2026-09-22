import type { NoticeTone } from "@/components/ui/notice";

/**
 * Portfolio action outcomes as validated codes — never free text from the URL.
 * The server action redirects with an opaque code, and this file is the only
 * place that turns a code into user-facing copy.
 */

export type PortfolioNotice = { tone: NoticeTone; message: string };

export function resolvePortfolioNotice(code: string | undefined): PortfolioNotice | null {
  switch (code) {
    case "item_added":
      return {
        tone: "success",
        message: "Portfolio item added. It is live on your public profile.",
      };
    case "item_deleted":
      return {
        tone: "info",
        message: "Portfolio item removed.",
      };
    case "reordered":
      return {
        tone: "success",
        message: "Portfolio order updated.",
      };
    case "too_fast":
      return {
        tone: "warning",
        message: "That is a lot of changes in a short time. Please wait a moment and try again.",
      };
    case "cap_reached":
      return {
        tone: "warning",
        message: "You have reached the maximum of 12 portfolio items. Remove an item before adding a new one.",
      };
    case "not_found":
      return {
        tone: "error",
        message: "Item not found or already removed.",
      };
    case "failed":
      return {
        tone: "error",
        message: "Something went wrong while updating your portfolio. Please try again.",
      };
    default:
      return null;
  }
}
