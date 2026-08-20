import type { EngagementType, RecruiterTier } from "@/lib/generated/prisma/enums";

/**
 * Browse-filter parsing for the public /jobs page. Deliberately forgiving:
 * these arrive as shareable URL query params and land in search engines, so
 * an invalid value is DROPPED, never an error page. Only values passing the
 * whitelists below ever reach the query layer.
 */

const ENGAGEMENT_TYPES = new Set(["HOURLY", "FIXED", "PART_TIME", "FULL_TIME"]);
const RECRUITER_TIERS = new Set(["UNVERIFIED", "VERIFIED", "TRUSTED"]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_FILTERS = 10;

export type JobBrowseFilters = {
  categorySlug?: string;
  skillSlugs?: string[];
  engagementType?: EngagementType;
  /** Viewer wants jobs whose budget range overlaps [budgetMin, budgetMax]. */
  budgetMin?: number;
  budgetMax?: number;
  isRemote?: boolean;
  recruiterTier?: RecruiterTier;
  cursor?: JobBrowseCursor;
};

export type JobBrowseCursor = { publishedAt: Date; id: string };

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const parseBudget = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : undefined;
};

export function parseJobBrowseParams(params: RawParams): JobBrowseFilters {
  const filters: JobBrowseFilters = {};

  const category = first(params.category);
  if (category && SLUG_RE.test(category)) filters.categorySlug = category;

  // skills: repeated params or one comma-separated value.
  const rawSkills = params.skills;
  const skillList = (Array.isArray(rawSkills) ? rawSkills : (rawSkills ?? "").split(","))
    .map((s) => s.trim())
    .filter((s) => s !== "" && SLUG_RE.test(s));
  if (skillList.length > 0) {
    filters.skillSlugs = [...new Set(skillList)].slice(0, MAX_SKILL_FILTERS);
  }

  const engagement = first(params.engagement);
  if (engagement && ENGAGEMENT_TYPES.has(engagement)) {
    filters.engagementType = engagement as EngagementType;
  }

  const budgetMin = parseBudget(first(params.budgetMin));
  const budgetMax = parseBudget(first(params.budgetMax));
  // An inverted range is a user mistake — drop the max rather than 0 results.
  if (budgetMin !== undefined) filters.budgetMin = budgetMin;
  if (budgetMax !== undefined && (budgetMin === undefined || budgetMax >= budgetMin)) {
    filters.budgetMax = budgetMax;
  }

  const remote = first(params.remote);
  if (remote === "true") filters.isRemote = true;
  else if (remote === "false") filters.isRemote = false;

  const tier = first(params.tier);
  if (tier && RECRUITER_TIERS.has(tier)) filters.recruiterTier = tier as RecruiterTier;

  const cursor = decodeJobBrowseCursor(first(params.cursor));
  if (cursor) filters.cursor = cursor;

  return filters;
}

/**
 * Keyset cursor over (publishedAt DESC, id DESC), encoded as
 * "<epoch-millis>~<job id>". Tampered or malformed cursors decode to null
 * (first page) rather than erroring — the id charset is checked and the
 * timestamp bounded to a plausible range.
 */
export function encodeJobBrowseCursor(cursor: JobBrowseCursor): string {
  return `${cursor.publishedAt.getTime()}~${cursor.id}`;
}

const CURSOR_ID_RE = /^[a-z0-9]{1,40}$/i;

export function decodeJobBrowseCursor(value: string | undefined): JobBrowseCursor | null {
  if (!value) return null;
  const sep = value.indexOf("~");
  if (sep === -1) return null;
  const millis = Number(value.slice(0, sep));
  const id = value.slice(sep + 1);
  if (!Number.isInteger(millis)) return null;
  // Sanity-bound the timestamp: 2020..1 day in the future.
  if (millis < Date.UTC(2020, 0, 1) || millis > Date.now() + 24 * 60 * 60 * 1000) return null;
  if (!CURSOR_ID_RE.test(id)) return null;
  return { publishedAt: new Date(millis), id };
}
