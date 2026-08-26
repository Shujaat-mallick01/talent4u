import { candidateCountries, searchCandidates, type CandidateRow } from "@/lib/db/candidate-search";
import { getEntitlementContext } from "@/lib/db/users";
import { getEntitlements } from "@/lib/pricing/entitlements";
import type { CandidateSearchCursor, CandidateSearchFilters } from "@/lib/validations/candidate-search";

/**
 * Candidate search, and the wall in front of it.
 *
 * CLAUDE.md: "Candidate search is the paid wall. Free recruiters must never
 * reach search, filters, or outbound messaging." Two things follow, and both
 * are load-bearing:
 *
 * 1. The refusal happens BEFORE any query runs. Not a filtered result set, not
 *    a blurred list, not the first three of forty — free recruiters get an
 *    upgrade page and the database is never asked who matches. A teaser is
 *    still a leak: the count alone tells a competitor how many React
 *    developers in Poland are open to work.
 *
 * 2. It is decided here, from the account's own row, not from anything the
 *    page sent. The caller is curl.
 *
 * Deactivated profiles are excluded one layer down, in the query, so there is
 * no path — filter, keyword or hand-edited URL — that surfaces someone who
 * took their page down.
 */

export type CandidateSearchView = {
  candidates: CandidateRow[];
  hasMore: boolean;
  nextCursor: CandidateSearchCursor | null;
  /** Countries with at least one live profile, for the filter dropdown. */
  countries: string[];
};

export type CandidateSearchResult =
  | { ok: true; view: CandidateSearchView }
  | { ok: false; reason: "not-recruiter" | "banned" | "plan-required" };

export async function searchCandidatesForUser(
  userId: string,
  filters: CandidateSearchFilters,
): Promise<CandidateSearchResult> {
  const context = await getEntitlementContext(userId);
  if (!context || context.role !== "RECRUITER") return { ok: false, reason: "not-recruiter" };

  // A removed employer keeps their data and loses the product. Searching
  // candidates is the one capability that would still "work" for them if the
  // ban were only enforced on publishing and messaging.
  if (context.isBanned) return { ok: false, reason: "banned" };

  const entitlements = getEntitlements({
    role: context.role,
    plan: context.plan,
    recruiterTier: context.recruiterTier,
  });
  // The wall. Nothing below this line runs for a free recruiter.
  if (!entitlements.recruiter.candidateSearch) return { ok: false, reason: "plan-required" };

  const [{ candidates, hasMore, nextCursor }, countries] = await Promise.all([
    searchCandidates(filters),
    candidateCountries(),
  ]);

  return {
    ok: true,
    view: { candidates, hasMore, nextCursor: hasMore ? nextCursor : null, countries },
  };
}

/**
 * Whether this account may search, without running a search.
 *
 * The nav uses this to decide whether "Find candidates" leads somewhere useful.
 * Purely cosmetic — the real refusal is the one above, and it does not care
 * what the nav decided.
 */
export async function canSearchCandidates(userId: string): Promise<boolean> {
  const context = await getEntitlementContext(userId);
  if (!context || context.role !== "RECRUITER" || context.isBanned) return false;
  return getEntitlements({
    role: context.role,
    plan: context.plan,
    recruiterTier: context.recruiterTier,
  }).recruiter.candidateSearch;
}
