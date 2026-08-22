import type { NoticeTone } from "@/components/ui/notice";

/**
 * Profile-editing outcomes as validated codes — never free text from the URL.
 * Same contract as app/dashboard/messages/notices.ts: the action redirects with
 * a code, this file is the only thing that turns a code into words.
 */

export type ProfileEditNotice = { tone: NoticeTone; message: string };

export function resolveProfileEditNotice(code: string | undefined): ProfileEditNotice | null {
  switch (code) {
    case "saved_approval_cleared":
      return {
        tone: "warning",
        message:
          "Saved — and because you changed your work links, the earlier review of them no longer applies. A reviewer confirmed the old links, not these. Re-submit from the verification page when the new ones are final.",
      };
    case "saved_withdrawn":
      return {
        tone: "warning",
        message:
          "Saved — and because you changed your work links, your pending verification submission was withdrawn. Those links are the evidence a reviewer judges, so re-submit from the verification page when they are final.",
      };
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
        message: "Profile saved. Your public page shows the changes, and its link is unchanged.",
      };
    case "no_profile":
      return {
        tone: "error",
        message: "There is no profile to edit yet — set one up first, then come back here.",
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
