import { DECIMAL_MARK } from "./safety";

/**
 * Reads an effort estimate, in hours, out of normalized tokens, so the safety
 * scanner can apply CLAUDE.md's "unpaid test tasks estimated above 4 hours"
 * rule instead of flagging every take-home.
 *
 * Operates on normalizeForScan output, where a decimal point survives as
 * DECIMAL_MARK ("1.5" -> "15") and a unit stuck to its number has been
 * split ("4hrs" -> "4 hrs").
 *
 * Two failure modes matter equally, and both were real:
 *   - reading an unrelated number as the estimate ("40 hours per week" is a
 *     SCHEDULE, "$50 per hour" is a RATE) wrongly holds an honest post;
 *   - missing the real size ("a full week") wrongly publishes a scam.
 * Hence: schedule and rate shapes are skipped, and vague-but-large durations
 * count.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const HOURS_PER_DAY = 8;
const HOURS_PER_WEEK = 40;
const HOURS_PER_MONTH = 160;

const MINUTE_UNITS = new Set(["minute", "minutes", "min", "mins"]);
const HOUR_UNITS = new Set(["hour", "hours", "hr", "hrs", "h"]);
const DAY_UNITS = new Set(["day", "days"]);
const WEEK_UNITS = new Set(["week", "weeks"]);
const MONTH_UNITS = new Set(["month", "months"]);

/** Fillers that may sit between a number and its unit: "a couple OF hours". */
const SKIPPABLE = new Set(["of", "a", "an", "the", "about", "approximately", "roughly"]);

/**
 * A duration written without a number that is still plainly larger than a few
 * hours: "a full week", "several days". Ignoring these let a scam hide its
 * size behind vague words.
 */
const VAGUE_QUANTIFIERS = new Set([
  "several", "full", "whole", "entire", "multiple", "some", "many", "couple", "few",
]);

/**
 * Words that reveal a number to be a recurring SCHEDULE or a pay RATE rather
 * than the size of a one-off task.
 */
const SCHEDULE_FOLLOWERS = new Set(["per", "each", "every"]);
const RATE_MARKERS = new Set(["rate", "salary", "paid", "pay", "wage", "budget", "usd", "eur", "gbp"]);

function readNumber(tokens: string[], i: number): { value: number; length: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;

  // Digits, possibly with a protected decimal point.
  const decimal = t.split(DECIMAL_MARK);
  if (decimal.length === 2 && /^\d{1,4}$/.test(decimal[0]) && /^\d{1,3}$/.test(decimal[1])) {
    return { value: Number(`${decimal[0]}.${decimal[1]}`), length: 1 };
  }
  if (/^\d{1,4}$/.test(t)) return { value: Number(t), length: 1 };

  if (TENS[t] !== undefined) {
    const next = tokens[i + 1];
    if (next !== undefined && UNITS[next] !== undefined && UNITS[next] < 10) {
      return { value: TENS[t] + UNITS[next], length: 2 }; // "twenty five"
    }
    return { value: TENS[t], length: 1 };
  }
  if (UNITS[t] !== undefined) return { value: UNITS[t], length: 1 };
  if (t === "couple") return { value: 2, length: 1 };
  if (t === "few") return { value: 3, length: 1 };
  if (t === "half") return { value: 0.5, length: 1 };
  // "an hour", "a month" — only ever read as 1 when a time unit follows,
  // which the caller checks, so ordinary articles cost nothing.
  if (t === "a" || t === "an") return { value: 1, length: 1 };
  return null;
}

function hoursFor(unit: string, value: number): number | null {
  if (MINUTE_UNITS.has(unit)) return value / 60;
  if (HOUR_UNITS.has(unit)) return value;
  if (DAY_UNITS.has(unit)) return value * HOURS_PER_DAY;
  if (WEEK_UNITS.has(unit)) return value * HOURS_PER_WEEK;
  if (MONTH_UNITS.has(unit)) return value * HOURS_PER_MONTH;
  return null;
}

/**
 * The largest plausible TASK size in these tokens, in hours, or null when
 * they state none. Ranges resolve to their upper bound — that is what an
 * applicant would actually spend.
 */
export function estimatedHoursForTask(tokens: string[]): number | null {
  let max: number | null = null;
  const consider = (hours: number) => {
    max = max === null ? hours : Math.max(max, hours);
  };

  for (let i = 0; i < tokens.length; i += 1) {
    // A vague-but-large duration: "a full week", "several days".
    if (VAGUE_QUANTIFIERS.has(tokens[i])) {
      let j = i + 1;
      while (j < tokens.length && SKIPPABLE.has(tokens[j])) j += 1;
      const unit = tokens[j];
      if (unit !== undefined && (DAY_UNITS.has(unit) || WEEK_UNITS.has(unit) || MONTH_UNITS.has(unit))) {
        const hours = hoursFor(unit, 1);
        if (hours !== null) consider(hours);
        continue;
      }
    }

    const first = readNumber(tokens, i);
    if (!first) continue;

    let cursor = i + first.length;
    let value = first.value;

    // A range: "6 to 8 hours", "20 25 hours", "three or four hours".
    if (tokens[cursor] === "to" || tokens[cursor] === "and" || tokens[cursor] === "or") {
      const second = readNumber(tokens, cursor + 1);
      if (second) {
        value = Math.max(value, second.value);
        cursor = cursor + 1 + second.length;
      }
    }

    while (cursor < tokens.length && SKIPPABLE.has(tokens[cursor])) cursor += 1;

    const unit = tokens[cursor];
    if (unit === undefined) continue;
    const hours = hoursFor(unit, value);
    if (hours === null) continue;

    const isSchedule = SCHEDULE_FOLLOWERS.has(tokens[cursor + 1] ?? "");
    const before = tokens[Math.max(0, i - 2)];
    const before2 = tokens[Math.max(0, i - 1)];
    const isRate = RATE_MARKERS.has(before ?? "") || RATE_MARKERS.has(before2 ?? "");

    // "40 hours PER week" is a schedule and "$50 an hour" a price — neither is
    // the size of a task.
    if (!isSchedule && !isRate) consider(hours);

    // Consume the whole reading either way, so its own tokens cannot be
    // re-read as a second, weaker estimate ("half AN hour" must stay 0.5, and
    // the "an hour" inside a skipped rate must not come back as 1).
    i = cursor;
  }

  return max;
}
