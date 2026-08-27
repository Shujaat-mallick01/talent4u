import type { NoticeTone } from "@/components/ui/notice";
import { settingsNoticeSchema, type SettingsNotice } from "@/lib/validations/settings";

/**
 * Settings outcomes as validated codes — never free text from the URL.
 *
 * This screen talks about passwords and account removal, which makes it the
 * worst page in the product to be able to inject a sentence into: a crafted
 * "?notice=your+password+expired,+call+…" rendered verbatim would be a
 * phishing page hosted on our own domain. Anything that is not one of the
 * codes below resolves to null.
 */

export type SettingsNoticeCopy = { tone: NoticeTone; message: string };

const COPY: Record<SettingsNotice, SettingsNoticeCopy> = {
  password_updated: {
    tone: "success",
    message: "Password changed. You are still signed in here.",
  },
  password_mismatch: {
    tone: "error",
    message: "The two passwords did not match. Type the new one again in both fields.",
  },
  password_too_short: {
    tone: "error",
    message: "That password is under 8 characters. Pick a longer one and save again.",
  },
  password_failed: {
    tone: "error",
    message:
      "The password was not changed. Sign out, sign back in and try again — changing it needs a current session.",
  },
  country_saved: {
    tone: "success",
    message: "Billing country saved. Your regional price applies from now on.",
  },
  country_invalid: {
    tone: "error",
    message: "That is not a country we bill in. Pick one from the list and save again.",
  },
  country_failed: {
    tone: "error",
    message: "The billing country was not saved. Reload and try again.",
  },
  deactivated: {
    tone: "success",
    message:
      "Your public page is down. Applications, engagements, messages and reviews are untouched, and everything in here still works.",
  },
  reactivated: {
    tone: "success",
    message: "Your public page is back up. Search engines will find it again on their next crawl.",
  },
  already_deactivated: {
    tone: "info",
    message: "Your public page was already down. Nothing changed.",
  },
  already_active: {
    tone: "info",
    message: "Your public page was already up. Nothing changed.",
  },
  reactivate_blocked: {
    tone: "error",
    message:
      "A moderator removed this company, so the page cannot be put back from here. The removed employers policy explains how removals are reviewed.",
  },
  no_profile: {
    tone: "error",
    message: "Finish setting up your profile before changing these settings.",
  },
  too_fast: {
    tone: "warning",
    message:
      "That is a lot of changes in a short time. Wait a few minutes and try again — nothing you already saved has been lost.",
  },
  digest_on: {
    tone: "success",
    message:
      "The weekly job digest is on. One email a week, listing new roles that match the skills on your profile.",
  },
  digest_off: {
    tone: "success",
    message:
      "The weekly job digest is off. Mail about your own applications, messages and account is unaffected.",
  },  failed: {
    tone: "error",
    message: "That change did not go through. Reload and try again.",
  },
};

export function resolveSettingsNotice(code: string | undefined): SettingsNoticeCopy | null {
  const parsed = settingsNoticeSchema.safeParse(code);
  return parsed.success ? COPY[parsed.data] : null;
}
