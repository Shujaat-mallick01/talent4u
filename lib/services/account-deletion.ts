import { anonymiseAccount } from "@/lib/db/account-deletion";
import { getBillingState } from "@/lib/db/subscription";
import { getUserAuthState } from "@/lib/db/users";
import { getSupabaseAdmin } from "@/lib/storage/supabase-admin";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { reportError } from "@/lib/observability/report-error";

/**
 * Deleting an account.
 *
 * The order matters, and it is chosen so that a failure part-way through
 * leaves the person BETTER off than not having started, never worse:
 *
 *   1. Cancel any live subscription. First, because the one outcome nobody
 *      would forgive is an account that no longer exists still being charged.
 *      If Stripe is unreachable the deletion stops here, with nothing changed
 *      and an error the person can act on.
 *   2. Anonymise the app-side rows, in one transaction.
 *   3. Remove the Supabase Auth user, so sign-in is impossible.
 *
 * Step 3 last on purpose: if it fails, the account is already anonymised and
 * carries `deletedAt`, which every authenticated lookup refuses. The person is
 * out either way; what is left is a stranded Auth row for an operator to
 * clear, which is a tidy-up rather than a breach.
 *
 * Confirmation is the account's own email address, typed. Not a checkbox: this
 * is irreversible by design — undoing it would need the identity it destroys —
 * and the cost of an accidental click is somebody's entire history here.
 */

export type DeleteAccountResult =
  | { ok: true; wasNamed: string }
  | {
      ok: false;
      reason:
        | "no-account"
        | "already-deleted"
        | "confirmation-mismatch"
        | "billing-unreachable"
        | "failed";
    };

export async function deleteAccountForUser(
  userId: string,
  typedEmail: string,
): Promise<DeleteAccountResult> {
  const account = await getUserAuthState(userId);
  if (!account) return { ok: false, reason: "no-account" };

  // Compared case-insensitively and trimmed: the point is to prove intent, not
  // to test typing. A person copying their own address out of the page above
  // should not be defeated by a trailing space.
  if (typedEmail.trim().toLowerCase() !== account.email.toLowerCase()) {
    return { ok: false, reason: "confirmation-mismatch" };
  }

  // ── 1. Stop the money ───────────────────────────────────────────────────
  const billing = await getBillingState(userId);
  const subscriptionId = billing?.subscription?.stripeSubscriptionId ?? null;

  if (subscriptionId && billing?.subscription?.status !== "CANCELED") {
    if (!stripeConfigured()) {
      // Refusing rather than proceeding: deleting the account would leave a
      // live subscription nobody can now reach the portal to cancel.
      return { ok: false, reason: "billing-unreachable" };
    }
    try {
      await getStripe().subscriptions.cancel(subscriptionId);
    } catch (error: unknown) {
      // Stripe's own "no such subscription" means it is already gone, which is
      // the state we wanted. Anything else stops the deletion.
      const message = error instanceof Error ? error.message : String(error);
      if (!/No such subscription|resource_missing/i.test(message)) {
        reportError(error, { scope: "account-deletion", extra: { step: "cancel-subscription" } });
        return { ok: false, reason: "billing-unreachable" };
      }
    }
  }

  // ── 2. Erase the person, keep the record ────────────────────────────────
  let summary: Awaited<ReturnType<typeof anonymiseAccount>>;
  try {
    summary = await anonymiseAccount(userId);
  } catch (error: unknown) {
    reportError(error, { scope: "account-deletion", extra: { step: "anonymise" } });
    return { ok: false, reason: "failed" };
  }

  // ── 3. Close the door ───────────────────────────────────────────────────
  try {
    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  } catch (error: unknown) {
    // Already anonymised and flagged deleted, so the account is unusable
    // regardless. Logged for an operator rather than surfaced to somebody who
    // has just left — telling them "partly deleted" would be alarming and
    // would not be true of anything they can see.
    reportError(error, { scope: "account-deletion", extra: { step: "delete-auth-user", userId } });
  }

  return { ok: true, wasNamed: summary.wasNamed };
}
