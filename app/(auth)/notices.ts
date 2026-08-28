import type { AuthNotice } from "@/lib/validations/auth";
import { authNoticeSchema } from "@/lib/validations/auth";

/**
 * The single source of user-facing auth copy. Actions and the callback emit
 * codes (see authNoticeSchema); pages resolve them here. Anything not on this
 * list — including attacker-supplied query text — resolves to null and renders
 * nothing, so the query string can never inject copy.
 */
const NOTICE_COPY: Record<AuthNotice, string> = {
  invalid_input: "Check the details you entered and try again.",
  signup_failed: "Could not sign up with those details.",
  invalid_credentials: "Invalid email or password.",
  google_unavailable: "Google sign-in is not available right now.",
  link_invalid: "That confirmation link is invalid or has expired.",
  oauth_failed: "Could not complete sign-in. Try again.",
  missing_code: "Missing authentication code.",
  pick_role: "Pick a role to continue.",
  email_required: "Your sign-in provider did not share an email address, which we require.",
  email_conflict:
    "That email is already attached to a different account. Sign out and use your original sign-in method, or contact support.",
  confirm_email: "Check your email to confirm your account, then sign in.",
  reset_sent:
    "If that address has an account, a reset link is on its way. The link works once and expires in an hour.",
  reset_link_expired:
    "That reset link has expired or was already used. Request a new one — they last an hour.",
  reset_failed: "Could not set that password. Request a new reset link and try again.",
  password_updated: "Password changed. You are signed in.",
  password_mismatch: "Both passwords must match.",
  password_too_short: "Use at least 8 characters.",
  account_deleted:
    "Your account is deleted. Your applications and any engagements you confirmed stay on the record for the people on the other side of them, with your name and details removed.",
  too_many:
    "Too many attempts from here. Wait a few minutes and try again — this is a limit on the number of tries, not on your account.",
};

export const resolveNotice = (value: string | null | undefined): string | null => {
  const parsed = authNoticeSchema.safeParse(value);
  return parsed.success ? NOTICE_COPY[parsed.data] : null;
};
