/**
 * Trigger terms for the automated safety scanner (lib/services/safety.ts).
 * Editable without touching code, per the Phase 4 brief — extend freely.
 *
 * Matching rules:
 * - UPFRONT_PAYMENT_TERMS and UNPAID_TEST_TERMS are flagged on any occurrence:
 *   there is no legitimate reason for a job post to ask for a registration fee
 *   or an unpaid multi-hour trial.
 * - PAYMENT_APP_TERMS are flagged only when they appear NEAR payment-request
 *   language (PAYMENT_CONTEXT_PATTERN), because "build a WhatsApp support bot"
 *   is a legitimate job on this platform while "send your WhatsApp for
 *   payment" is not. CLAUDE.md: "off-platform payment app handles PAIRED with
 *   payment requests".
 */

export const UPFRONT_PAYMENT_TERMS: readonly string[] = [
  "registration fee",
  "security deposit",
  "training fee",
  "equipment purchase",
  "equipment fee",
  "processing fee",
  "activation fee",
  "application fee",
  "starter kit",
  "refundable deposit",
  "background check fee",
];

export const UNPAID_TEST_TERMS: readonly string[] = [
  "unpaid test",
  "unpaid trial",
  "unpaid assignment",
  "unpaid sample",
  "unpaid task",
  "trial is unpaid",
  "test is unpaid",
  "free trial project",
  "free sample project",
];

export const PAYMENT_APP_TERMS: readonly string[] = [
  "paypal",
  "venmo",
  "cash app",
  "cashapp",
  "zelle",
  "western union",
  "moneygram",
  "skrill",
  "payoneer",
  "usdt",
  "bitcoin",
  "crypto wallet",
  "gift card",
  "whatsapp",
  "telegram",
];

/**
 * Payment-REQUEST language that turns a payment-app mention into a flag when
 * found within PAYMENT_CONTEXT_WINDOW characters of it. Deliberately matches
 * request SHAPES ("pay ... via", "send your <handle>", "transfer funds",
 * "invoices ... settled"), not bare compensation vocabulary — "integrate
 * PayPal payments" is a legitimate job on this platform; "we pay via PayPal"
 * is not. Runs against normalizeForScan output (lowercased, punctuation
 * collapsed to single spaces).
 */
export const PAYMENT_CONTEXT_PATTERN =
  /\b(?:pay|pays|paid|payments?|payouts?)\b[^.!?\n]{0,40}\b(?:via|through|thru|using|off[- ]?(?:site|platform)|directly|outside)\b|\bsend\s+(?:money|funds|(?:us\s+|me\s+)?your\s+(?:paypal|venmo|zelle|cash\s?app|cashapp|skrill|payoneer|usdt|bitcoin|wallet|account|handle|address|number|details|id))\b|\b(?:transfer|wire|remit)\w*\s+(?:money|funds|fees?|the\s+(?:payment|money|funds))\b|\bfirst\s+transfer\b|\binvoices?\b[^.!?\n]{0,40}\bsettled?\b/i;

export const PAYMENT_CONTEXT_WINDOW = 80;
