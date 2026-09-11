import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import { exportCandidatesForUser } from "@/lib/services/candidate-export";
import { parseCandidateSearchParams } from "@/lib/validations/candidate-search";

/**
 * GET /api/recruiter/candidates/export — the Team-tier CSV.
 *
 * The fourth route handler in the app, and the first that is not a callback
 * from somebody else's system, so it owes an explanation. Everything else here
 * is a Server Action, but an Action cannot set Content-Disposition and a
 * download is nothing except that header. Doing it as an Action would mean
 * shipping the whole CSV into a client component to rebuild as a Blob — more
 * code, a new "use client" file, and broken without JavaScript, to avoid a
 * route handler that the platform already has.
 *
 * It is NOT a data API. It answers one content type, takes the same query
 * string the page it lives beside already uses, and returns a file.
 *
 * SECURITY, since this is a new server-side surface over walled data and the
 * project's own audit flags exactly this shape of thing as where a paid wall
 * gets forgotten:
 *
 *   - requireRole("RECRUITER") before anything is parsed, so a logged-out or
 *     freelancer caller is turned away here rather than by the page that links
 *     to it.
 *   - The service re-reads plan, tier and ban state from the account's own row
 *     and applies BOTH gates. curl gets the identical refusal a browser does.
 *   - Filters come from parseCandidateSearchParams, the same forgiving parser
 *     the page uses, so there is no second interpretation of a filter and no
 *     way to widen the result set by hand-editing the URL.
 *   - Rate limited: this is the cheapest request in the product to repeat and
 *     the most rows per response.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireRole("RECRUITER");

  const limit = await checkRateLimit("candidate-export", user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many exports. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const filters = parseCandidateSearchParams(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  const result = await exportCandidatesForUser(user.id, filters);
  if (!result.ok) {
    // 403 for every refusal: which gate closed is not a stranger's business,
    // and the page already tells a signed-in recruiter what their plan allows.
    return NextResponse.json({ error: result.reason }, { status: 403 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="talent4u-candidates-${stamp}.csv"`,
      // Contains walled data. Never let a shared cache hold it.
      "Cache-Control": "private, no-store",
      "X-Talent4u-Rows": String(result.rows),
      ...(result.truncated ? { "X-Talent4u-Truncated": "true" } : {}),
    },
  });
}
