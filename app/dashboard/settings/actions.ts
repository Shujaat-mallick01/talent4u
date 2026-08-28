"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { deleteAccountForUser } from "@/lib/services/account-deletion";
import {
  changePassword,
  setBillingCountryForUser,
  setJobDigestForUser,
  setProfileVisibilityForUser,
} from "@/lib/services/settings";
import {
  deleteAccountSchema,
  type SettingsNotice,
} from "@/lib/validations/settings";

/**
 * Account settings Server Actions.
 *
 * requireUser runs first on every one, and the service re-parses whatever the
 * form sent. Nothing here reads a user id, a role, or a profile id off the
 * form — a curl POST can name a country and an intent, and that is all it can
 * name. The account acted on is always the one holding the session cookie.
 */

const PAGE = "/dashboard/settings";

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

/** Outcomes travel back as codes; notices.ts is the only place they become copy. */
const back = (notice: SettingsNotice): void => {
  redirect(`${PAGE}?notice=${notice}`);
};

/**
 * Sets a new password on the current session.
 *
 * No current password is asked for: the session cookie is the proof, exactly
 * as in the recovery flow (app/(auth)/actions.ts setNewPassword). Supabase
 * owns the write; if the session has gone stale it refuses and we say so.
 */
export async function changeAccountPassword(formData: FormData): Promise<void> {
  await requireUser();

  const result = await changePassword(
    { password: str(formData, "password"), confirm: str(formData, "confirm") },
    async (password) => {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.updateUser({ password });
      return !error;
    },
  );

  if (result.ok) {
    back("password_updated");
    return;
  }
  back(
    result.reason === "password-mismatch"
      ? "password_mismatch"
      : result.reason === "password-too-short"
        ? "password_too_short"
        : "password_failed",
  );
}

/** Stores the billing country regional pricing is resolved from. */
export async function saveBillingCountry(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  // Self-scoped and individually cheap, but still an unbounded write loop
  // behind one button. The ceiling is far above anything a person editing
  // their own page will reach.
  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);


  const result = await setBillingCountryForUser(user.id, { country: str(formData, "country") });

  if (result.ok) {
    back("country_saved");
    return;
  }
  back(result.reason === "invalid-country" ? "country_invalid" : "country_failed");
}

/**
 * Takes the public page down, or puts it back up. Never deletes anything —
 * see lib/services/settings.ts for what deactivation does and does not touch.
 */
export async function saveProfileVisibility(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  // Self-scoped and individually cheap, but still an unbounded write loop
  // behind one button. The ceiling is far above anything a person editing
  // their own page will reach.
  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);


  const result = await setProfileVisibilityForUser(user.id, { action: str(formData, "action") });

  if (result.ok) {
    if (result.changed) back(result.deactivated ? "deactivated" : "reactivated");
    else back(result.deactivated ? "already_deactivated" : "already_active");
    return;
  }
  back(
    result.reason === "banned"
      ? "reactivate_blocked"
      : result.reason === "no-profile"
        ? "no_profile"
        : "failed",
  );
}

/**
 * The weekly job digest switch.
 *
 * A checkbox that posts nothing when unchecked, so the absent value IS the
 * off signal — the service reads it that way rather than requiring a hidden
 * companion field that could drift out of sync with the box.
 */
export async function saveJobDigest(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const result = await setJobDigestForUser(user.id, { optIn: formData.get("optIn") });
  if (!result.ok) {
    back("failed");
    return;
  }
  back(result.optIn ? "digest_on" : "digest_off");
}

/**
 * Deletes the account, then ends the session.
 *
 * Signing out afterwards is not decoration: the Auth user is gone, so the
 * cookie in the browser now points at nothing. Clearing it is what stops the
 * next page load looking like a broken session rather than a completed action.
 */
export async function deleteAccount(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  const parsed = deleteAccountSchema.safeParse({
    confirmEmail: formData.get("confirmEmail"),
  });
  if (!parsed.success) {
    back("delete_mismatch");
    return;
  }

  const result = await deleteAccountForUser(user.id, parsed.data.confirmEmail);
  if (!result.ok) {
    back(
      result.reason === "confirmation-mismatch"
        ? "delete_mismatch"
        : result.reason === "billing-unreachable"
          ? "delete_billing"
          : "delete_failed",
    );
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/signin?message=account_deleted");
}
