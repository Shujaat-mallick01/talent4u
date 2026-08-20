import type { FlagReason } from "@/lib/generated/prisma/enums";
import {
  PAYMENT_APP_TERMS,
  PAYMENT_CONTEXT_PATTERN,
  PAYMENT_CONTEXT_WINDOW,
  UNPAID_TEST_TERMS,
  UPFRONT_PAYMENT_TERMS,
} from "@/lib/config/safety-terms";

/**
 * The automated safety scanner. Pure text analysis — callers decide what to do
 * with a match (the publish flow holds the job as PENDING_REVIEW and opens a
 * SafetyFlag; it never auto-publishes flagged content, per CLAUDE.md).
 *
 * This is the Phase-2 minimal scanner; Phase 4 refines it (hour estimation for
 * unpaid tasks, message scanning). Term lists live in lib/config/safety-terms.
 */

export type SafetyMatch = { reason: FlagReason; matchedTerm: string };

// Common Cyrillic homoglyphs seen in scam posts; full UTS#39 confusable
// folding is a Phase 4 refinement.
const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "у": "y",
};

/**
 * Canonicalizes text before term matching so trivial obfuscation does not
 * bypass the lists: NFKC folds width/compatibility forms, format chars
 * (zero-width space/joiner, soft hyphen) are stripped, combining marks are
 * dropped, common Cyrillic look-alikes are folded, and every punctuation or
 * whitespace run collapses to a single space ("registration-fee",
 * "registration  fee", "registration\nfee" all become "registration fee").
 */
export function normalizeForScan(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Cf}/gu, "")
    .replace(/\p{M}/gu, "")
    .replace(/[аеорсхіу]/g, (c) => HOMOGLYPHS[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function scanTextForSafetyFlags(text: string): SafetyMatch | null {
  const haystack = normalizeForScan(text);

  for (const term of UPFRONT_PAYMENT_TERMS) {
    if (haystack.includes(term)) return { reason: "UPFRONT_PAYMENT", matchedTerm: term };
  }

  for (const term of UNPAID_TEST_TERMS) {
    if (haystack.includes(term)) return { reason: "LONG_UNPAID_TEST", matchedTerm: term };
  }

  // Payment apps flag only when paired with payment-request language nearby —
  // "build a WhatsApp bot" is a legitimate job; "send your WhatsApp to get
  // paid" is not.
  for (const term of PAYMENT_APP_TERMS) {
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(term, from);
      if (idx === -1) break;
      const start = Math.max(0, idx - PAYMENT_CONTEXT_WINDOW);
      const end = Math.min(haystack.length, idx + term.length + PAYMENT_CONTEXT_WINDOW);
      if (PAYMENT_CONTEXT_PATTERN.test(haystack.slice(start, end))) {
        return { reason: "OFF_PLATFORM_PAYMENT", matchedTerm: term };
      }
      from = idx + term.length;
    }
  }

  return null;
}
