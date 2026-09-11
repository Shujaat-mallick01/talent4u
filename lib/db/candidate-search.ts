import { Prisma } from "@/lib/generated/prisma/client";
import type { CandidateSearchCursor, CandidateSearchFilters } from "@/lib/validations/candidate-search";

import { prisma } from "./client";

/**
 * Candidate search: the query behind the paid wall.
 *
 * Raw SQL, and it has to be. `FreelancerProfile.searchVector` is a
 * `GENERATED ALWAYS` tsvector over headline (weight A) and bio (weight B) with
 * a GIN index — Prisma models it as `Unsupported("tsvector")` and cannot
 * express `@@`, `ts_rank`, or the row comparison the cursor needs.
 *
 * Two queries on purpose. The raw one decides WHICH profiles and in what
 * order; Prisma then hydrates those ids with skills and the rest, type-safely.
 * Hand-mapping twenty columns and a joined skill list out of $queryRaw is how
 * a search page ends up quietly disagreeing with the profile page it links to.
 *
 * The sort is four deep and every level earns its place:
 *   1. searchBoost  — Pro freelancers rank above free. The denormalized column
 *                     exists for exactly this; a join through User to
 *                     Subscription on every search would not hold up.
 *   2. rank         — ts_rank over the query, 0 when there is no keyword.
 *   3. createdAt    — newest first among equals.
 *   4. id           — makes the order TOTAL, which is what lets the cursor
 *                     work. Without it two profiles sharing a timestamp could
 *                     land on both pages or neither.
 */

export const CANDIDATE_PAGE_SIZE = 20;

/** Ranked ids only. The order this returns is the order the page renders. */
type ScoredRow = {
  id: string;
  searchBoost: boolean;
  createdAt: Date;
  rank: number;
};

function buildWhere(filters: CandidateSearchFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    // Never surface a profile its owner has taken down. Same rule as every
    // other public read of this table.
    Prisma.sql`f."deactivatedAt" IS NULL`,
  ];

  if (filters.q) {
    parts.push(Prisma.sql`f."searchVector" @@ websearch_to_tsquery('english', ${filters.q})`);
  }
  if (filters.country) {
    parts.push(Prisma.sql`f."country" = ${filters.country}`);
  }
  if (filters.openToWork) {
    parts.push(Prisma.sql`f."isOpenToWork" = true`);
  }
  if (filters.verification) {
    parts.push(
      Prisma.sql`f."verification" = ${filters.verification}::"FreelancerVerification"`,
    );
  }
  // A rate filter excludes profiles that never stated one. Including them
  // would mean "$20–60/hr" returns people who might cost anything, which is
  // not what the recruiter asked and not something they can act on. The UI
  // says so next to the field.
  if (filters.rateMin !== undefined) {
    parts.push(Prisma.sql`f."hourlyRateUsd" IS NOT NULL AND f."hourlyRateUsd" >= ${filters.rateMin}`);
  }
  if (filters.rateMax !== undefined) {
    parts.push(Prisma.sql`f."hourlyRateUsd" IS NOT NULL AND f."hourlyRateUsd" <= ${filters.rateMax}`);
  }
  // ANY of the chosen skills, not all: a recruiter ticking five skills is
  // describing the shape of the work, and demanding every one of them returns
  // an empty page and teaches them not to use the filter.
  if (filters.skillSlugs && filters.skillSlugs.length > 0) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "SkillOnFreelancer" sf
      JOIN "Skill" s ON s."id" = sf."skillId"
      WHERE sf."freelancerId" = f."id"
        AND s."slug" IN (${Prisma.join(filters.skillSlugs)})
    )`);
  }

  return Prisma.join(parts, " AND ");
}

async function scoredIds(
  filters: CandidateSearchFilters,
  pageSize: number,
): Promise<ScoredRow[]> {
  const rankExpr = filters.q
    ? Prisma.sql`ts_rank(f."searchVector", websearch_to_tsquery('english', ${filters.q}))`
    : Prisma.sql`0::real`;

  // Row comparison against the cursor. Every sort column is DESC, so "<" on
  // the whole tuple is exactly "comes after the cursor" — one predicate rather
  // than the four-way OR ladder the same thing needs written out by hand.
  const after = filters.cursor
    ? Prisma.sql`WHERE ("searchBoost", "rank", "createdAt", "id") <
        (${filters.cursor.searchBoost}, ${filters.cursor.rank}::real, ${filters.cursor.createdAt}, ${filters.cursor.id})`
    : Prisma.empty;

  // One extra row tells us whether a next page exists.
  return prisma.$queryRaw<ScoredRow[]>`
    WITH scored AS (
      SELECT
        f."id"          AS "id",
        f."searchBoost" AS "searchBoost",
        f."createdAt"   AS "createdAt",
        ${rankExpr}     AS "rank"
      FROM "FreelancerProfile" f
      WHERE ${buildWhere(filters)}
    )
    SELECT "id", "searchBoost", "createdAt", "rank"
    FROM scored
    ${after}
    ORDER BY "searchBoost" DESC, "rank" DESC, "createdAt" DESC, "id" DESC
    LIMIT ${pageSize + 1}
  `;
}

/**
 * One page of ranked candidates.
 *
 * pageSize is a parameter rather than the constant because the CSV export runs
 * the SAME query for a much larger page — one ranked result set, one set of
 * filters, one wall in front of it. An export that built its own query would
 * be a second place for the paid wall to be got wrong.
 */
export async function searchCandidates(
  filters: CandidateSearchFilters,
  pageSize: number = CANDIDATE_PAGE_SIZE,
) {
  const scored = await scoredIds(filters, pageSize);
  const page = scored.slice(0, pageSize);

  if (page.length === 0) {
    return { candidates: [], hasMore: false, nextCursor: null };
  }

  const rows = await prisma.freelancerProfile.findMany({
    where: { id: { in: page.map((r) => r.id) } },
    select: {
      id: true,
      // Server-side only, for matching against existing outreach threads. It
      // is never rendered — a freelancer's auth id is not the recruiter's
      // business, and the page links by slug.
      userId: true,
      slug: true,
      displayName: true,
      headline: true,
      country: true,
      timezone: true,
      hourlyRateUsd: true,
      avatarUrl: true,
      verification: true,
      isOpenToWork: true,
      searchBoost: true,
      skills: {
        select: { yearsExp: true, skill: { select: { slug: true, name: true } } },
        orderBy: { skill: { name: "asc" } },
        take: 12,
      },
    },
  });

  // `IN (...)` returns rows in whatever order Postgres finds them; the ranking
  // is the whole point of this feature, so the page is rebuilt in the scored
  // order rather than trusting the hydration query's.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const candidates = page.map((r) => byId.get(r.id)).filter((r) => r !== undefined);

  const last = page[page.length - 1];
  return {
    candidates,
    hasMore: scored.length > pageSize,
    nextCursor: {
      searchBoost: last.searchBoost,
      rank: Number(last.rank),
      createdAt: last.createdAt,
      id: last.id,
    } satisfies CandidateSearchCursor,
  };
}

export type CandidateRow = Awaited<ReturnType<typeof searchCandidates>>["candidates"][number];

/** Countries that actually have a live profile, for the filter dropdown. */
export async function candidateCountries(): Promise<string[]> {
  const rows = await prisma.freelancerProfile.findMany({
    where: { deactivatedAt: null },
    select: { country: true },
    distinct: ["country"],
    orderBy: { country: "asc" },
  });
  return rows.map((r) => r.country);
}
