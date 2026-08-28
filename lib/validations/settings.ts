import { z } from "zod";

import { COUNTRY_CODES } from "@/lib/geo/countries";

/**
 * Account settings input.
 *
 * Everything here is re-validated on the server regardless of what the form
 * enforced, because the caller may be curl. The select on the page offers only
 * real country codes; this schema is what makes that true rather than merely
 * likely.
 */

/**
 * Changing the password from a live session.
 *
 * The current password is deliberately NOT collected: the Supabase session
 * cookie IS the proof of identity, and asking for a password we would then
 * have to verify ourselves means re-implementing a check Supabase already owns.
 * Same shape and same minimum as the recovery flow in lib/validations/auth.ts,
 * so a password set here and a password set from a reset link agree on what is
 * acceptable.
 */
export const changePasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Both passwords must match.",
    path: ["confirm"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * The billing country regional pricing is resolved from
 * (lib/pricing/bands.ts). Uppercased before the membership test so a lowercase
 * code from a hand-rolled request is normalized rather than rejected, but
 * anything that is not an ISO code we actually offer is refused — a country we
 * do not know would silently fall back to the STANDARD band, which is a
 * pricing decision, not a validation outcome.
 */
export const billingCountrySchema = z.object({
  country: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => COUNTRY_CODES.has(v), "Choose a country from the list."),
});

export type BillingCountryInput = z.infer<typeof billingCountrySchema>;

/** Taking the public page down, or putting it back up. */
export const profileVisibilitySchema = z.object({
  action: z.enum(["deactivate", "reactivate"]),
});

export type ProfileVisibilityInput = z.infer<typeof profileVisibilitySchema>;

/**
 * The weekly job digest toggle.
 *
 * A checkbox posts its value only when checked, so absence means off. Parsing
 * it as "on" | undefined rather than a boolean keeps that browser behaviour
 * explicit instead of relying on a coercion that reads as a bug later.
 */
export const jobDigestSchema = z.object({
  optIn: z.literal("on").optional(),
});

export type JobDigestInput = z.infer<typeof jobDigestSchema>;

/**
 * Deleting an account.
 *
 * The confirmation is the account's own email address, typed out. Not a
 * checkbox: this is irreversible by design, and the cost of a mis-click is
 * somebody's entire history on the platform. Matched server-side against the
 * session's email — what the form sends proves intent and nothing else.
 */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().min(1, "Type your email address to confirm."),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/**
 * Every outcome the settings screen can report, as a stable code. The page
 * renders only these — never free text from the query string — so a crafted
 * link cannot inject copy into a page that talks about passwords. The
 * code→copy map lives in app/dashboard/settings/notices.ts.
 */
export const settingsNoticeSchema = z.enum([
  "password_updated",
  "password_mismatch",
  "password_too_short",
  "password_failed",
  "country_saved",
  "country_invalid",
  "country_failed",
  "deactivated",
  "reactivated",
  "already_deactivated",
  "already_active",
  "reactivate_blocked",
  "no_profile",
  "too_fast",
  "delete_mismatch",
  "delete_billing",
  "delete_failed",
  "digest_on",
  "digest_off",
  "failed",
]);

export type SettingsNotice = z.infer<typeof settingsNoticeSchema>;
