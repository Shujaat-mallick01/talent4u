"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { openBillingPortal, startCheckout } from "@/lib/services/billing";
import { checkoutSchema, type BillingNoticeCode } from "@/lib/validations/billing";

/**
 * Server Actions behind the billing page.
 *
 * requireUser runs before anything is parsed, and the service re-resolves the
 * account from that session — so the only thing a form contributes is which
 * plan was clicked. It cannot name a price, an account, or a Stripe id: the
 * amount comes from lib/pricing and the customer from the caller's own row.
 */

const PAGE = "/dashboard/billing";

// A function declaration, not an arrow: TypeScript only uses a `never` return
// for control-flow narrowing when the callee is declared, which is what lets
// the success paths below read result.url without a redundant guard.
function back(notice: BillingNoticeCode): never {
  redirect(`${PAGE}?notice=${notice}`);
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  const parsed = checkoutSchema.safeParse({ plan: formData.get("plan") });
  if (!parsed.success) back("not_purchasable");

  const result = await startCheckout(user.id, parsed.data.plan);
  if (!result.ok) {
    if (result.reason === "unavailable") back("checkout_unavailable");
    if (result.reason === "not-purchasable") back("not_purchasable");
    if (result.reason === "already-on-plan") back("already_on_plan");
    back("checkout_failed");
  }

  // Stripe's hosted page — outside our origin, so a plain redirect.
  redirect(result.url);
}

export async function openPortalAction(): Promise<void> {
  const { user } = await requireUser();

  const result = await openBillingPortal(user.id);
  if (!result.ok) {
    if (result.reason === "unavailable") back("portal_unavailable");
    if (result.reason === "no-customer") back("no_customer");
    back("portal_failed");
  }

  redirect(result.url);
}
