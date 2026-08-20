import { describe, expect, it, vi } from "vitest";

// The where-builder is pure; stub the client module so importing this file
// never needs DATABASE_URL or the generated engine.
vi.mock("./client", () => ({ prisma: {} }));

import { buildJobBrowseWhere } from "./job-browse";

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
