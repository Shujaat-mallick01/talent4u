import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { pruneRateLimits } from "@/lib/db/rate-limit";
import { runJobDigest } from "@/lib/services/digest";

/**
 * The weekly digest run, as an endpoint a scheduler calls.
 *
 * A route rather than a worker on purpose. CLAUDE.md rules out introducing a
 * queue or a microservice, and a weekly email does not need one: the platform's
 * cron hits this URL, the run is idempotent (see lib/services/digest.ts), and
 * there is no new piece of infrastructure to operate or pay for.
 *
 * It is protected by a shared secret rather than a session, because the caller
 * is a machine. Without CRON_SECRET set the route refuses everything — the
 * failure mode of a misconfigured deployment is "no digests", never "anyone on
 * the internet can make us mail every freelancer".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time, and length-safe: timingSafeEqual throws on a length mismatch. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<NextResponse> {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (expected.length === 0) {
    console.error("[digest] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // Vercel Cron sends `Authorization: Bearer <secret>`; a manual curl can use
  // the same header. Nothing is read from the query string, so the secret
  // never lands in an access log or a referrer.
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runJobDigest();
    console.log(
      `[digest] considered=${summary.considered} sent=${summary.sent} noMatches=${summary.noMatches} failed=${summary.failed}`,
    );

    // Piggybacked rather than given a schedule of its own. The rate-limit
    // table is written constantly and read never; expired rows cost storage
    // and nothing else, so a job that runs hourly to reclaim kilobytes would
    // be more operational surface than the problem deserves.
    const pruned = await pruneRateLimits();
    if (pruned > 0) console.log(`[digest] pruned ${pruned} expired rate-limit rows`);

    return NextResponse.json({ ...summary, prunedRateLimits: pruned });
  } catch (error) {
    console.error("[digest] run failed:", error instanceof Error ? error.message : error);
    // 500 so the scheduler records a failure. Safe to retry: accounts already
    // marked this run are not selected again.
    return NextResponse.json({ error: "run failed" }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

/** Same handler: some schedulers POST. */
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
