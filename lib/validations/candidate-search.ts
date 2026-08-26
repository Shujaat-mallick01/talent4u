import { z } from "zod";

import type { FreelancerVerification } from "@/lib/generated/prisma/enums";

/**
 * Filter parsing for recruiter candidate search.
 *
 * Same forgiving shape as the public job browse: these are GET params behind a
 * shareable URL, so an invalid value is DROPPED rather than turned into an
 * error page. A recruiter who hand-edits `?rateMax=abc` gets their results
 * without that filter, not a stack trace.
 *
 * Unlike job browse this surface is NOT indexed — it sits behind the paid wall
 * — so there is no canonical to normalize for. The normalizing is still worth
 * doing: it keeps one result set behind one URL, which is what makes a search
 * link a recruiter pastes to a colleague show them the same thing.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const VERIFICATIONS = new Set(["NONE", "ID_VERIFIED", "ID_AND_WORK_VERIFIED"]);
const MAX_SKILL_FILTERS = 10;

/** Longest keyword search we put in a URL, and the input's maxLength. */
export const CANDIDATE_SEARCH_MAX_LENGTH = 80;

/** Highest hourly rate the filter accepts, in whole USD. */
export const RATE_CEILING = 2000;

const searchTermSchema = z
  .string()
  .transform((s) => s.trim().slice(0, CANDIDATE_SEARCH_MAX_LENGTH).trim())
  .pipe(z.string().min(1));

export type CandidateSearchFilters = {
  /** Free text over headline (weight A) and bio (weight B). */
  q?: string;
  skillSlugs?: string[];
  country?: string;
  /** Whole USD per hour. */
  rateMin?: number;
  rateMax?: number;
  verification?: FreelancerVerification;
  /** True filters to available candidates; absent means "either". */
  openToWork?: boolean;
  cursor?: CandidateSearchCursor;
};

/**
 * Where the last page stopped, in the exact order the query sorts by.
 *
 * All four parts are needed because the sort is four deep: Pro before free,
 * then relevance, then newest, then id as the tiebreak that makes the order
 * total. Carrying fewer would let a row appear on two pages or on none.
 */
export type CandidateSearchCursor = {
  searchBoost: boolean;
  rank: number;
  createdAt: Date;
  id: string;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const parseRate = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= RATE_CEILING ? n : undefined;
};

export function parseCandidateSearchParams(params: RawParams): CandidateSearchFilters {
  const filters: CandidateSearchFilters = {};

  const q = searchTermSchema.safeParse(first(params.q));
  if (q.success) filters.q = q.data;

  // skills: repeated params or one comma-separated value.
  const rawSkills = params.skills;
  const skills = (Array.isArray(rawSkills) ? rawSkills : (rawSkills ?? "").split(","))
    .map((s) => s.trim())
    .filter((s) => s !== "" && SLUG_RE.test(s));
  if (skills.length > 0) filters.skillSlugs = [...new Set(skills)].slice(0, MAX_SKILL_FILTERS);

  const country = first(params.country)?.toUpperCase();
  if (country && COUNTRY_RE.test(country)) filters.country = country;

  const rateMin = parseRate(first(params.rateMin));
  const rateMax = parseRate(first(params.rateMax));
  // An inverted range returns nothing forever and looks like a broken page, so
  // it is read as the range the person plainly meant.
  if (rateMin !== undefined && rateMax !== undefined && rateMin > rateMax) {
    filters.rateMin = rateMax;
    filters.rateMax = rateMin;
  } else {
    if (rateMin !== undefined) filters.rateMin = rateMin;
    if (rateMax !== undefined) filters.rateMax = rateMax;
  }

  const verification = first(params.verification);
  if (verification && VERIFICATIONS.has(verification)) {
    filters.verification = verification as FreelancerVerification;
  }

  if (first(params.openToWork) === "true") filters.openToWork = true;

  const cursor = decodeCandidateCursor(first(params.cursor));
  if (cursor) filters.cursor = cursor;

  return filters;
}

export function encodeCandidateCursor(cursor: CandidateSearchCursor): string {
  return Buffer.from(
    JSON.stringify({
      b: cursor.searchBoost,
      r: cursor.rank,
      c: cursor.createdAt.toISOString(),
      i: cursor.id,
    }),
    "utf-8",
  ).toString("base64url");
}

/**
 * Never throws. A cursor is an opaque token a person can edit or truncate, and
 * the right answer to a broken one is page one — not a 500.
 */
export function decodeCandidateCursor(value: string | undefined): CandidateSearchCursor | null {
  if (!value) return null;
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf-8"));
    if (typeof raw !== "object" || raw === null) return null;
    const { b, r, c, i } = raw as Record<string, unknown>;
    if (typeof b !== "boolean" || typeof r !== "number" || !Number.isFinite(r)) return null;
    if (typeof c !== "string" || typeof i !== "string" || i === "") return null;
    const createdAt = new Date(c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { searchBoost: b, rank: r, createdAt, id: i };
  } catch {
    return null;
  }
}
