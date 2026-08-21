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
  "unpaid take home",
  "unpaid work sample",
  "unpaid challenge",
  "trial is unpaid",
  "test is unpaid",
  "task is unpaid",
  "not paid for the trial",
  "free trial project",
  "free sample project",
  "spec work",
];

/**
 * CLAUDE.md holds a post for "unpaid test tasks estimated ABOVE 4 HOURS", so
 * an unpaid test alone is not the trigger — its size is. A stated estimate at
 * or under this many hours is left alone; above it, or with no bound at all,
 * the post is held (an unbounded unpaid task cannot be shown to be small).
 */
export const UNPAID_TEST_HOUR_LIMIT = 4;

/**
 * How many tokens either side of the unpaid-test mention may describe ITS
 * size. The search also stops at a sentence boundary, so a number belonging
 * to a different sentence ("we reply within 2 hours.") can neither bound nor
 * inflate the estimate.
 */
export const UNPAID_TEST_ESTIMATE_TOKENS = 25;

/**
 * Phrases that turn an unpaid-test mention into a REASSURANCE rather than an
 * ask ("we never ask for unpaid test work"). Matched immediately before the
 * term, so a post promising the opposite of the scam is not held for it.
 */
export const UNPAID_TEST_NEGATIONS: readonly string[] = [
  "no",
  "never",
  "without",
  "not",
  "nor",
  "zero",
  "avoid",
  "instead",
  "rather",
  // Contractions arrive apostrophe-stripped from normalizeForScan
  // ("don't" -> "don t"), so the stems are what actually match. Bare "can"
  // is deliberately absent — it is far too common in ordinary job copy.
  "dont",
  "don",
  "doesn",
  "didn",
  "wont",
  "won",
  "wouldn",
  "isn",
  "aren",
  "wasn",
  "weren",
  "haven",
  "hasn",
  "cannot",
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
// The "not a sentence end" guards use \u0001, the sentence marker that
// survives normalization — a plain [^.!?] class is dead here, because the
// scanner matches AFTER punctuation has been folded away.
export const PAYMENT_CONTEXT_PATTERN =
  /\b(?:pay|pays|paid|payments?|payouts?)\b[^\u0001]{0,40}\b(?:via|through|thru|using|off[- ]?(?:site|platform)|directly|outside)\b(?!\s+(?:payroll|the\s+platform|talent4u|this\s+site|the\s+site|our\s+finance|accounts\s+payable))|\bsend\s+(?:money|funds|(?:us\s+|me\s+)?your\s+(?:paypal|venmo|zelle|cash\s?app|cashapp|skrill|payoneer|usdt|bitcoin|wallet|account|handle|address|number|details|id))\b|\b(?:transfer|wire|remit)\w*\s+(?:money|funds|fees?|the\s+(?:payment|money|funds))\b|\bfirst\s+transfer\b|\binvoices?\b[^\u0001]{0,40}\bsettled?\b/i;

/** Tokens either side of a payment-app mention to search for a request. */
export const PAYMENT_CONTEXT_WINDOW = 18;
