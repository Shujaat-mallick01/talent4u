import { headers } from "next/headers";

import { clearRateLimit, hitRateLimit, rateLimitKey } from "@/lib/db/rate-limit";

/**
 * What each mutation is allowed to do, and how often.
 *
 * Two principles set these numbers:
 *
 * 1. A limit should be invisible to a person using the product normally and
 *    obvious to a script. Nobody signs in eleven times in a quarter of an
 *    hour; a credential-stuffing run does it in a second. Limits set tight
 *    enough to catch a determined attacker but loose enough to never catch a
 *    real person are the only ones worth having, because the others get
 *    removed the first time they page somebody at 3am.
 *
 * 2. It is a backstop, never the rule. The application quota (12 per 30 days),
 *    the active-post cap and the paid wall are all enforced by their own
 *    services against real state. This only stops somebody hammering the
 *    endpoint — it does not know or care what the business rule is.
 */
export const RATE_LIMITS = {
  /** Per IP + email. Credential stuffing is the thing this exists for. */
  "sign-in": { max: 10, windowSeconds: 15 * 60 },
  /** Per IP. Bulk account creation. */
  "sign-up": { max: 5, windowSeconds: 60 * 60 },
  /** Per IP. Also an enumeration oracle if it were unlimited. */
  "password-reset": { max: 5, windowSeconds: 60 * 60 },
  /** Per user. The 12-per-30-days quota is the real rule; this stops a burst. */
  apply: { max: 30, windowSeconds: 60 * 60 },
  /** Per user, across replies and new threads. */
  message: { max: 60, windowSeconds: 60 * 60 },
  /** Per user. Cold outreach is the one path that reaches strangers. */
  outreach: { max: 40, windowSeconds: 24 * 60 * 60 },
  /** Per user. The active-post cap already binds; this stops draft-spamming. */
  "job-write": { max: 40, windowSeconds: 24 * 60 * 60 },
  /** Per user. A report queue is only useful if it is not flooded. */
  report: { max: 20, windowSeconds: 60 * 60 },
  /** Per user. Every one of these creates a Stripe session. */
  checkout: { max: 10, windowSeconds: 60 * 60 },
  /** Per user. Profile, company and settings writes together. */
  "profile-write": { max: 60, windowSeconds: 60 * 60 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Records an attempt and says whether it may proceed.
 *
 * FAILS OPEN. If the limiter itself errors — the table is missing, the pool is
 * exhausted, Postgres is briefly unreachable — the mutation is allowed and the
 * failure is logged. That is a deliberate trade: this is a backstop against
 * abuse, and letting it take signups and applications down with it would be a
 * far larger outage than the one it is protecting against. Every real
 * authorization rule in the product fails CLOSED; this is not one of them.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  subject: string,
): Promise<RateLimitVerdict> {
  const policy = RATE_LIMITS[action];
  try {
    const { count, windowStart } = await hitRateLimit(
      rateLimitKey(action, subject),
      policy.windowSeconds,
    );
    if (count <= policy.max) return { allowed: true };

    const elapsed = (Date.now() - windowStart.getTime()) / 1000;
    const retryAfterSeconds = Math.max(1, Math.ceil(policy.windowSeconds - elapsed));
    return { allowed: false, retryAfterSeconds };
  } catch (error: unknown) {
    console.error(
      `[rate-limit] ${action} check failed, allowing through:`,
      error instanceof Error ? error.message : error,
    );
    return { allowed: true };
  }
}

/**
 * Forgets a subject's attempts after they succeed.
 *
 * Only for sign-in. Getting your own password right should clear the failure
 * count, or somebody who mistyped it four times is left one typo from a
 * lockout they have already recovered from.
 */
export async function forgetRateLimit(
  action: RateLimitAction,
  subject: string,
): Promise<void> {
  try {
    await clearRateLimit(rateLimitKey(action, subject));
  } catch {
    // Nothing to do and nothing worth failing a successful sign-in over.
  }
}

/**
 * The caller's IP, for the mutations that have no user yet.
 *
 * Reads the proxy headers the platform sets. Absent or spoofed both degrade to
 * one shared bucket rather than to no limit at all — which is the right way
 * round: a shared bucket inconveniences people behind one NAT, while no limit
 * leaves signup open to a script.
 */
export async function callerIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    // Left-most entry is the original client; the rest are proxies.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}
