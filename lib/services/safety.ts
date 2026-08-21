import type { FlagReason } from "@/lib/generated/prisma/enums";
import {
  PAYMENT_APP_TERMS,
  PAYMENT_CONTEXT_PATTERN,
  PAYMENT_CONTEXT_WINDOW,
  UNPAID_TEST_ESTIMATE_TOKENS,
  UNPAID_TEST_HOUR_LIMIT,
  UNPAID_TEST_NEGATIONS,
  UNPAID_TEST_TERMS,
  UPFRONT_PAYMENT_TERMS,
} from "@/lib/config/safety-terms";

import { estimatedHoursForTask } from "./duration";

/**
 * The automated safety scanner. Pure text analysis — callers decide what to do
 * with a match (the publish flow holds the job as PENDING_REVIEW and opens a
 * SafetyFlag; it never auto-publishes flagged content, per CLAUDE.md).
 *
 * Term lists live in lib/config/safety-terms and are editable without touching
 * this file.
 *
 * The hard part is the CLAUDE.md rule "unpaid test tasks estimated ABOVE 4
 * HOURS": the size is the trigger, so the scanner has to decide which numbers
 * and which negations actually BELONG to the unpaid-test mention. Doing that
 * on punctuation-stripped text is what made an earlier version wrong in both
 * directions — "we reply within 2 hours" disarmed an unbounded 30-hour ask,
 * and "this role is not remote; the unpaid test takes 30 hours" read as a
 * denial. Normalization therefore PRESERVES sentence and clause boundaries as
 * marker tokens, and every heuristic below respects them.
 */

export type SafetyMatch = { reason: FlagReason; matchedTerm: string };

// Common Cyrillic homoglyphs seen in scam posts; full UTS#39 confusable
// folding is a later refinement.
const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "у": "y",
};

/** Sentence break. Nothing — term, estimate, or negation — reaches across one. */
export const SENTENCE_MARK = "\u0001";
/** Clause break (a comma). Estimates may cross one; negations may not. */
export const CLAUSE_MARK = "\u0002";
/** Stands in for a decimal point so "1.5 hours" survives punctuation collapse. */
export const DECIMAL_MARK = "\u0003";

/**
 * Canonicalizes text before matching.
 *
 * Trivial obfuscation is folded away (NFKC, zero-width and combining marks
 * stripped, Cyrillic look-alikes folded, hyphens and newlines collapsed to
 * spaces, so "registration-fee" and "registration\nfee" both match
 * "registration fee"). Sentence punctuation and commas survive as marker
 * tokens, and decimal points inside numbers survive as DECIMAL_MARK.
 */
export function normalizeForScan(text: string): string {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\p{Cf}/gu, "")
      .replace(/\p{M}/gu, "")
      .replace(/[аеорсхіу]/g, (c) => HOMOGLYPHS[c] ?? c)
      // Protect a decimal point BEFORE punctuation is touched, or "1.5 hours"
      // would read as the range "1 5 hours" and resolve to 5.
      .replace(/(\d)[.,](\d)/g, `$1${DECIMAL_MARK}$2`)
      // Separate a unit stuck to its number: "4hrs" -> "4 hrs", "20h" -> "20 h".
      .replace(/(\d)(\p{L})/gu, "$1 $2")
      // Sentence enders and dashes become boundaries; commas become the softer
      // clause boundary. Newlines and hyphens deliberately do NOT — they occur
      // mid-phrase from wrapping and compounding.
      .replace(/[.;:!?]+/g, ` ${SENTENCE_MARK} `)
      // Dashes and commas are the softer CLAUSE break: a dash usually sets off
      // an aside within one thought ("a small task — about 2 hours"), so an
      // estimate may cross it even though a negation may not.
      .replace(/[—–]+|,+/g, ` ${CLAUSE_MARK} `)
      .replace(
        new RegExp(`[^\\p{L}\\p{N}${SENTENCE_MARK}${CLAUSE_MARK}${DECIMAL_MARK}]+`, "gu"),
        " ",
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

const isMark = (token: string): boolean =>
  token === SENTENCE_MARK || token === CLAUSE_MARK;

/**
 * Token indices where `term` occurs as whole words. Matching on the token
 * stream rather than by substring means an adjective cannot be smuggled in,
 * and — crucially — a phrase can never be manufactured across a boundary
 * ("built to spec, working closely" must not match "spec work").
 */
function findTermTokenIndices(tokens: string[], term: string): number[] {
  const needle = term.split(" ").filter(Boolean);
  const hits: number[] = [];
  if (needle.length === 0) return hits;

  outer: for (let i = 0; i + needle.length <= tokens.length; i += 1) {
    for (let k = 0; k < needle.length; k += 1) {
      const token = tokens[i + k];
      const want = needle[k];
      // The final word tolerates a plural: "unpaid test" matches "unpaid tests".
      const ok =
        k === needle.length - 1
          ? token === want || token === `${want}s` || token === `${want}es`
          : token === want;
      if (!ok) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

/** True when any listed term appears as whole words. */
function findFirstTerm(tokens: string[], terms: readonly string[]): string | null {
  for (const term of terms) {
    if (findTermTokenIndices(tokens, term).length > 0) return term;
  }
  return null;
}

const NEGATION_LOOKBACK_TOKENS = 4;

/**
 * True when the unpaid-test mention at `at` is denied rather than demanded.
 *
 * The negation must govern the term: it has to sit in the SAME clause, within
 * a few words. "We never ask for unpaid test work" is a reassurance; "There is
 * no charge, and the unpaid test takes 30 hours" is not — its "no" belongs to
 * a different clause and must not disarm the check.
 */
/**
 * Conjunctions that start a new statement without punctuation. A negation
 * before one of these governs the earlier statement, not this one: "this role
 * is not remote AND the unpaid test takes 30 hours" is not a denial.
 */
const BRIDGE_TOKENS = new Set([
  "and", "but", "or", "so", "yet", "while", "whilst", "although", "though",
  "however", "plus", "then", "because", "since", "if", "when", "after",
]);

function isNegatedAt(tokens: string[], at: number): boolean {
  for (let i = at - 1, seen = 0; i >= 0 && seen < NEGATION_LOOKBACK_TOKENS; i -= 1, seen += 1) {
    if (isMark(tokens[i])) return false; // a boundary ends the clause
    if (BRIDGE_TOKENS.has(tokens[i])) return false; // a new statement begins
    if (UNPAID_TEST_NEGATIONS.includes(tokens[i])) return true;
  }
  return false;
}

/**
 * The tokens around an unpaid-test mention that could plausibly describe ITS
 * size: outward in both directions, stopping at a sentence boundary. Commas
 * are crossed, because estimates commonly attach that way ("an unpaid test,
 * about two hours").
 */
function sentenceWindow(
  tokens: string[],
  at: number,
  termLength: number,
  reach: number,
): string[] {
  let start = at;
  for (let i = at - 1, seen = 0; i >= 0 && seen < reach; i -= 1, seen += 1) {
    if (tokens[i] === SENTENCE_MARK) break;
    start = i;
  }
  let end = at + termLength;
  for (let i = at + termLength, seen = 0; i < tokens.length && seen < reach; i += 1, seen += 1) {
    if (tokens[i] === SENTENCE_MARK) break;
    end = i + 1;
  }
  return tokens.slice(start, end);
}

export function scanTextForSafetyFlags(text: string): SafetyMatch | null {
  const haystack = normalizeForScan(text);
  const tokens = haystack.split(" ").filter(Boolean);

  const upfront = findFirstTerm(tokens, UPFRONT_PAYMENT_TERMS);
  if (upfront) return { reason: "UPFRONT_PAYMENT", matchedTerm: upfront };

  // CLAUDE.md holds unpaid tests "estimated ABOVE 4 HOURS". A mention is left
  // alone only when it is genuinely denied, or genuinely bounded at or under
  // the limit by an estimate that belongs to it. An unbounded ask cannot be
  // shown to be small, so it is held.
  for (const term of UNPAID_TEST_TERMS) {
    const termLength = term.split(" ").length;
    for (const at of findTermTokenIndices(tokens, term)) {
      if (isNegatedAt(tokens, at)) continue;
      const hours = estimatedHoursForTask(
        sentenceWindow(tokens, at, termLength, UNPAID_TEST_ESTIMATE_TOKENS),
      );
      if (hours === null || hours > UNPAID_TEST_HOUR_LIMIT) {
        return { reason: "LONG_UNPAID_TEST", matchedTerm: term };
      }
    }
  }

  // Payment apps flag only when paired with payment-REQUEST language in the
  // same sentence — "integrate PayPal payments" is a legitimate job here.
  for (const term of PAYMENT_APP_TERMS) {
    for (const at of findTermTokenIndices(tokens, term)) {
      const termLength = term.split(" ").length;
      // Deliberately NOT sentence-bounded: scammers split the handle and the
      // request across short sentences ("Contact us on Telegram. Invoices are
      // settled there."). Precision comes from the pattern excluding
      // legitimate channels instead.
      const window = tokens
        .slice(
          Math.max(0, at - PAYMENT_CONTEXT_WINDOW),
          Math.min(tokens.length, at + termLength + PAYMENT_CONTEXT_WINDOW),
        )
        .join(" ");
      // Bound the request phrase at a sentence mark, which survives
      // normalization — the old [^.!?] guard was dead once punctuation was
      // stripped, so "paid monthly through payroll." matched across sentences.
      if (PAYMENT_CONTEXT_PATTERN.test(window)) {
        return { reason: "OFF_PLATFORM_PAYMENT", matchedTerm: term };
      }
    }
  }

  return null;
}
