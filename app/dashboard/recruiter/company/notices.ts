import type { NoticeTone } from "@/components/ui/notice";

/**
 * Company-editing outcomes as validated codes — never free text from the URL.
 * Same contract as app/dashboard/messages/notices.ts.
 */

export type CompanyEditNotice = { tone: NoticeTone; message: string };

export function resolveCompanyEditNotice(code: string | undefined): CompanyEditNotice | null {
  switch (code) {
    case "photo_saved":
      return { tone: "success", message: "Photo updated. It shows everywhere your name does." };
    case "photo_failed":
      return {
        tone: "error",
        message: "That image didn't take. Use a PNG, JPEG or WebP under 2 MB and try again.",
      };
    case "saved":
      return {
        tone: "success",
        message:
          "Company details saved. Your public page shows the changes, and its link is unchanged.",
      };
    case "banned":
      return {
        tone: "error",
        message:
          "This account has been removed from Talent4u, so its company page is now a matter of record and cannot be edited. Our removed employers policy explains what happens next.",
      };
    case "no_profile":
      return {
        tone: "error",
        message: "There is no company to edit yet — set one up first, then come back here.",
      };
    case "failed":
      return {
        tone: "error",
        message: "That didn't save. Reload the page and try again — nothing was changed.",
      };
    default:
      return null;
  }
}
