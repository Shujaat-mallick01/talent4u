import { describe, expect, it, vi } from "vitest";

// The where-builder is pure; stub the client module so importing this file
// never needs DATABASE_URL or the generated engine. Both spellings of the
// path are stubbed because job-match reaches it through the alias.
vi.mock("./client", () => ({ prisma: {} }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

// scoreJobMatch is exercised here rather than in a suite of its own: browse is
// the surface that renders it on every row, and the rules that matter — a
// skill-less job scoring nothing, a partial match rounding honestly — are the
// ones this page depends on.
import { scoreJobMatch } from "@/lib/services/job-match";

import { buildJobBrowseWhere } from "./job-browse";

const skills = (...names: string[]) =>
  names.map((name) => ({ skill: { slug: name, name: name.toUpperCase() } }));

const CUTOFF = new Date("2026-08-20T06:00:00.000Z");

describe("buildJobBrowseWhere", () => {
  it("always restricts to ACTIVE", () => {
    const where = buildJobBrowseWhere({}, null);
    expect(where.AND).toContainEqual({ status: "ACTIVE" });
  });

  it("applies the early-access cutoff for non-Pro viewers", () => {
    const where = buildJobBrowseWhere({}, CUTOFF);
    expect(where.AND).toContainEqual({ publishedAt: { lte: CUTOFF } });
  });

  it("omits the cutoff for Pro viewers", () => {
    const where = buildJobBrowseWhere({}, null);
    expect(JSON.stringify(where)).not.toContain("publishedAt");
  });

  it("matches jobs having ANY selected skill", () => {
    const where = buildJobBrowseWhere({ skillSlugs: ["nextjs", "python"] }, null);
    expect(where.AND).toContainEqual({
      skills: { some: { skill: { slug: { in: ["nextjs", "python"] } } } },
    });
  });

  it("uses overlap semantics for budget, with NULL as unbounded", () => {
    const where = buildJobBrowseWhere({ budgetMin: 1000, budgetMax: 5000 }, null);
    expect(where.AND).toContainEqual({
      OR: [{ budgetMaxUsd: null }, { budgetMaxUsd: { gte: 1000 } }],
    });
    expect(where.AND).toContainEqual({
      OR: [{ budgetMinUsd: null }, { budgetMinUsd: { lte: 5000 } }],
    });
  });

  it("builds a strict keyset condition from the cursor", () => {
    const publishedAt = new Date("2026-08-19T12:00:00.000Z");
    const where = buildJobBrowseWhere({ cursor: { publishedAt, id: "abc" } }, null);
    expect(where.AND).toContainEqual({
      OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: "abc" } }],
    });
    // The redundant lte bound turns the keyset into a b-tree Index Cond so
    // deep pages don't scan from the newest row.
    expect(where.AND).toContainEqual({ publishedAt: { lte: publishedAt } });
  });

  it("combines the cutoff and cursor without clobbering either", () => {
    const publishedAt = new Date("2026-08-19T12:00:00.000Z");
    const where = buildJobBrowseWhere({ cursor: { publishedAt, id: "abc" } }, CUTOFF);
    const and = where.AND as unknown[];
    expect(and).toContainEqual({ publishedAt: { lte: CUTOFF } });
    expect(and).toContainEqual({
      OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: "abc" } }],
    });
  });

  it("searches title, description and company name case-insensitively", () => {
    const where = buildJobBrowseWhere({ q: "shopify" }, null);
    const contains = { contains: "shopify", mode: "insensitive" };
    expect(where.AND).toContainEqual({
      OR: [
        { title: contains },
        { description: contains },
        { recruiter: { companyName: contains } },
      ],
    });
  });

  it("adds no search clause when there is no keyword", () => {
    expect(JSON.stringify(buildJobBrowseWhere({}, null))).not.toContain("contains");
  });

  it("keeps the search as one OR group, so it ANDs with every other filter", () => {
    // A flattened OR would make "shopify" widen the category filter instead of
    // narrowing it — the classic search-plus-facets bug.
    const where = buildJobBrowseWhere({ q: "shopify", categorySlug: "shopify" }, null);
    const and = where.AND as Record<string, unknown>[];
    expect(and.filter((clause) => "OR" in clause)).toHaveLength(1);
    expect(and).toContainEqual({ category: { slug: "shopify" } });
  });

  it("filters remote, tier, engagement, and category", () => {
    const where = buildJobBrowseWhere(
      {
        isRemote: false,
        recruiterTier: "TRUSTED",
        engagementType: "HOURLY",
        categorySlug: "ai-automation",
      },
      null,
    );
    expect(where.AND).toContainEqual({ isRemote: false });
    expect(where.AND).toContainEqual({ recruiterTier: "TRUSTED" });
    expect(where.AND).toContainEqual({ engagementType: "HOURLY" });
    expect(where.AND).toContainEqual({ category: { slug: "ai-automation" } });
  });
});

describe("scoreJobMatch (the browse match column)", () => {
  it("scores the share of the job's skills the viewer has, and names both sides", () => {
    const match = scoreJobMatch(
      new Set(["nextjs", "typescript", "figma"]),
      skills("nextjs", "typescript", "python", "rust"),
    );
    expect(match).toEqual({
      score: 50,
      matched: ["NEXTJS", "TYPESCRIPT"],
      missing: ["PYTHON", "RUST"],
    });
  });

  it("returns null for a job listing no skills rather than a flattering 100", () => {
    expect(scoreJobMatch(new Set(["nextjs"]), [])).toBeNull();
  });

  it("scores 0 for a viewer with no overlap, and 100 for a full one", () => {
    expect(scoreJobMatch(new Set(["rust"]), skills("nextjs"))?.score).toBe(0);
    expect(scoreJobMatch(new Set(), skills("nextjs"))?.score).toBe(0);
    expect(scoreJobMatch(new Set(["nextjs", "rust"]), skills("nextjs"))?.score).toBe(100);
  });

  it("counts only the job's skills — extra skills on the profile never inflate it", () => {
    const wide = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(scoreJobMatch(wide, skills("a", "zzz"))?.score).toBe(50);
  });

  it("rounds to a whole percent", () => {
    expect(scoreJobMatch(new Set(["a"]), skills("a", "b", "c"))?.score).toBe(33);
    expect(scoreJobMatch(new Set(["a", "b"]), skills("a", "b", "c"))?.score).toBe(67);
  });
});
