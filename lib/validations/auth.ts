import { z } from "zod";

// Roles a user can self-select at signup. ADMIN is deliberately absent —
// admin accounts are created out-of-band (seed / manual SQL), never via any
// public endpoint.
export const selectableRoleSchema = z.enum(["FREELANCER", "RECRUITER"]);

export type SelectableRole = z.infer<typeof selectableRoleSchema>;

/**
 * Signing up is an email and a password, and nothing else.
 *
 * Role used to live here, which meant the one irreversible decision in the
 * product was demanded before the account existed. It is asked immediately
 * afterwards instead, by chooseRole on /onboarding — the same path OAuth
 * accounts have always taken.
 */
export const signUpSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const roleChoiceSchema = z.object({
  role: selectableRoleSchema,
});

/** Requesting a reset link. Only the address — nothing else is needed. */
export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address."),
});

/**
 * Setting a new password from a recovery session. Confirmation is checked
 * here rather than only in the browser, so a mismatch cannot slip past a
 * disabled-JavaScript submit.
 */
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Both passwords must match.",
    path: ["confirm"],
  });

/**
 * Every user-facing notice the auth flow can show, as a stable code. Pages
 * render only these — never free text from the query string — so a crafted
 * link like ?error=call+1-800-scam cannot inject attacker copy. The code→copy
 * map lives in app/(auth)/notices.ts.
 */
export const authNoticeSchema = z.enum([
  "invalid_input",
  "signup_failed",
  "invalid_credentials",
  "google_unavailable",
  "link_invalid",
  "oauth_failed",
  "missing_code",
  "pick_role",
  "email_required",
  "email_conflict",
  "confirm_email",
  "reset_sent",
  "reset_link_expired",
  "reset_failed",
  "password_updated",
  "password_mismatch",
  "password_too_short",
  "too_many",
  "account_deleted",
]);

export type AuthNotice = z.infer<typeof authNoticeSchema>;

/**
 * A post-auth destination supplied via ?next=. Returns a safe same-origin
 * absolute path or null.
 *
 * A prefix check alone is not enough: the WHATWG URL parser folds "\" to "/"
 * and strips tab/newline/CR, so "/\evil.com" and "/<TAB>/evil.com" both
 * survive a naive test yet resolve to a foreign origin. We reject those
 * characters and then canonicalize against a throwaway origin, requiring the
 * result not to escape it — anything that does is discarded, closing the
 * open-redirect vector for every consumer.
 */
export const sanitizeNextPath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\t\n\r]/.test(value)) return null;

  const base = "http://internal.invalid";
  try {
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return null;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return null;
  }
};
