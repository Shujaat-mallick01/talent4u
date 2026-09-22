import type { NoticeTone } from "@/components/ui/notice";
import { isBillingNoticeCode, type BillingNoticeCode } from "@/lib/validations/billing";

/**
 * Billing outcomes as validated codes — never free text from the URL.
 *
 * A page about money is the last place that should render a stranger's
 * sentence: "?notice=your+card+was+declined,+call+…" on our own domain is a
 * ready-made phishing page. Anything not in this table resolves to null.
 *
 * Note what checkout_complete does NOT say. It reports that Stripe finished,
 * not that a plan was granted — the plan on this page is read from the row the
 * webhook writes, and a person who types the URL sees their real plan
 * unchanged. The success redirect is a courtesy; the signed webhook is the
 * evidence.
 */

export type BillingNoticeCopy = { tone: NoticeTone; message: string };

const COPY: Record<BillingNoticeCode, BillingNoticeCopy> = {
  checkout_complete: {
    tone: "success",
    message:
      "Payment received. Your plan below updates the moment Stripe confirms it — usually seconds. Reload if it still looks unchanged.",
  },
  checkout_cancelled: {
    tone: "info",
    message: "Checkout closed, nothing was charged. Your plan is unchanged.",
  },
  checkout_failed: {
    tone: "error",
    message: "Checkout could not be opened. Nothing was charged. Try again in a moment.",
  },
  beta_free: {
    tone: "info",
    message:
      "Nothing to pay. Talent4u is free while it is in beta — every feature is switched on for everyone, and there is no card to add. We will give plenty of notice before that changes.",
  },
  checkout_unavailable: {
    tone: "error",
    message: "Payments are not switched on for this deployment yet.",
  },
  not_purchasable: {
    tone: "error",
    message: "That plan is not available on this account.",
  },
  already_on_plan: {
    tone: "info",
    message:
      "You are already on that plan. Use Manage billing to change your card, switch plan, or cancel.",
  },
  manage_in_portal: {
    tone: "info",
    message:
      "You already have a subscription with us, so switching plan happens in the billing portal rather than at a new checkout — that way you are charged the difference instead of being billed for two plans at once.",
  },
  account_removed: {
    tone: "error",
    message:
      "This company has been removed from Talent4u, so there is no plan to buy — a subscription would not let you post, message or be found. Contact us if you believe that is a mistake.",
  },
  checkout_too_fast: {
    tone: "warning",
    message:
      "That is a lot of checkout attempts in a short time. Wait a few minutes — nothing has been charged.",
  },
  portal_failed: {
    tone: "error",
    message: "The billing portal could not be opened. Try again in a moment.",
  },
  portal_unavailable: {
    tone: "error",
    message: "Payments are not switched on for this deployment yet.",
  },
  no_customer: {
    tone: "info",
    message: "There is nothing to manage yet — you have never been charged.",
  },
};

export function resolveBillingNotice(code: string | undefined): BillingNoticeCopy | null {
  return isBillingNoticeCode(code) ? COPY[code] : null;
}
