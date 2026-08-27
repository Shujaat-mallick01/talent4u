import { createHash } from "node:crypto";

import { prisma } from "./client";

/**
 * The counter behind rate limiting.
 *
 * One statement, and that is the whole point. `INSERT ... ON CONFLICT DO
 * UPDATE` both resets an expired window and increments a live one atomically,
 * so two requests arriving together cannot both read "one so far" and both
 * write "two". A read-then-write would let a burst through at exactly the
 * moment a burst is the thing being defended against — which is the failure
 * mode that makes a rate limiter worse than useless, because it looks like it
 * is working.
 */

export type HitResult = {
  /** Hits recorded in the current window, including this one. */
  count: number;
  /** When the current window began. */
  windowStart: Date;
};

/**
 * Keys hold an email address or an IP. Neither belongs in a table that is
 * otherwise not personal data, and neither is ever read back — the key is only
 * ever compared to itself — so it is stored as a digest.
 */
export function rateLimitKey(action: string, subject: string): string {
  return `${action}:${createHash("sha256").update(subject).digest("base64url").slice(0, 32)}`;
}

/** Records one hit and returns the state of the window it landed in. */
export async function hitRateLimit(key: string, windowSeconds: number): Promise<HitResult> {
  const rows = await prisma.$queryRaw<HitResult[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${windowSeconds}::double precision)
        THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${windowSeconds}::double precision)
        THEN now()
        ELSE "RateLimit"."windowStart"
      END
    RETURNING "count", "windowStart"
  `;
  // The RETURNING clause always yields exactly one row; the fallback exists so
  // a limiter can never be the thing that throws inside a mutation.
  return rows[0] ?? { count: 1, windowStart: new Date() };
}

/**
 * Forgets a subject's hits. Used after a SUCCESSFUL sign-in, so that getting
 * your own password right clears the failure count rather than leaving you
 * one typo away from a lockout you already recovered from.
 */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/**
 * Drops rows whose window closed long ago.
 *
 * Called from the weekly cron rather than on a schedule of its own: the table
 * is write-heavy and read-never, so stale rows cost storage and nothing else,
 * and an hourly job to reclaim kilobytes is not worth operating.
 */
export async function pruneRateLimits(olderThanSeconds = 24 * 60 * 60): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const { count } = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return count;
}
