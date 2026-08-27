import { z } from "zod";

/**
 * Input schemas for billing. The only thing a person submits to start a
 * checkout is which plan they want — the amount is never accepted from the
 * client, it is computed server-side from lib/pricing and their billing
 * country. A form that could name its own price is a form that will.
 */

/** FREE is absent on purpose: it is not something anyone buys. */
export const PURCHASABLE_PLANS = [
  "FREELANCER_PRO",
  "RECRUITER_GROWTH",
  "RECRUITER_TEAM",
] as const;

export const checkoutSchema = z.object({
  plan: z.enum(PURCHASABLE_PLANS, { error: "Choose one of the paid plans." }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const BILLING_NOTICE_CODES = [
  "checkout_failed",
  "checkout_unavailable",
  "not_purchasable",
  "already_on_plan",
  "manage_in_portal",
  "account_removed",
  "checkout_too_fast",
  "portal_failed",
  "portal_unavailable",
  "no_customer",
  "checkout_cancelled",
  "checkout_complete",
] as const;

export type BillingNoticeCode = (typeof BILLING_NOTICE_CODES)[number];

export function isBillingNoticeCode(value: unknown): value is BillingNoticeCode {
  return (
    typeof value === "string" && (BILLING_NOTICE_CODES as readonly string[]).includes(value)
  );
}
