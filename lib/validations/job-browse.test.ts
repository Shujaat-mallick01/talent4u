import { describe, expect, it } from "vitest";

import {
  decodeJobBrowseCursor,
  encodeJobBrowseCursor,
  JOB_SEARCH_MAX_LENGTH,
  parseJobBrowseParams,
} from "./job-browse";

describe("parseJobBrowseParams", () => {
  it("parses a full valid set", () => {
    const f = parseJobBrowseParams({
      category: "ai-automation",
      skills: ["nextjs", "typescript"],
      engagement: "FIXED",
      budgetMin: "1000",
      budgetMax: "5000",
      remote: "true",
      tier: "VERIFIED",
    });
    expect(f).toMatchObject({
      categorySlug: "ai-automation",
      skillSlugs: ["nextjs", "typescript"],
      engagementType: "FIXED",
      budgetMin: 1000,
      budgetMax: 5000,
      isRemote: true,
      recruiterTier: "VERIFIED",
    });
  });

  it("accepts comma-separated skills and dedupes", () => {
    const f = parseJobBrowseParams({ skills: "nextjs,typescript,nextjs" });
    expect(f.skillSlugs).toEqual(["nextjs", "typescript"]);
  });

  it("drops invalid values instead of erroring", () => {
    const f = parseJobBrowseParams({
      category: "Not A Slug!",
      skills: "<script>,nextjs",
      engagement: "GIG",
      budgetMin: "-5",
      budgetMax: "abc",
      remote: "yes",
      tier: "PLATINUM",
      cursor: "garbage",
    });
    expect(f.categorySlug).toBeUndefined();
    expect(f.skillSlugs).toEqual(["nextjs"]);
    expect(f.engagementType).toBeUndefined();
    expect(f.budgetMin).toBeUndefined();
    expect(f.budgetMax).toBeUndefined();
    expect(f.isRemote).toBeUndefined();
    expect(f.recruiterTier).toBeUndefined();
    expect(f.cursor).toBeUndefined();
  });

  it("drops an inverted budget max", () => {
    const f = parseJobBrowseParams({ budgetMin: "5000", budgetMax: "100" });
    expect(f.budgetMin).toBe(5000);
    expect(f.budgetMax).toBeUndefined();
  });

  it("caps the number of skill filters", () => {
    const many = Array.from({ length: 15 }, (_, i) => `skill-${i}`);
    const f = parseJobBrowseParams({ skills: many });
    expect(f.skillSlugs).toHaveLength(10);
  });
});

describe("keyword search (q)", () => {
  it("keeps a plain term as typed", () => {
    expect(parseJobBrowseParams({ q: "shopify app" }).q).toBe("shopify app");
  });

  it("trims surrounding whitespace so one term is one URL", () => {
    expect(parseJobBrowseParams({ q: "  react native \n" }).q).toBe("react native");
  });

  it("drops an empty or whitespace-only term instead of filtering on nothing", () => {
    // The GET form always submits q, so `?q=` is the common case, not an edge.
    expect(parseJobBrowseParams({ q: "" }).q).toBeUndefined();
    expect(parseJobBrowseParams({ q: "   " }).q).toBeUndefined();
    expect(parseJobBrowseParams({}).q).toBeUndefined();
  });

  it("caps a long term rather than rejecting it", () => {
    const long = "a".repeat(JOB_SEARCH_MAX_LENGTH + 40);
    const q = parseJobBrowseParams({ q: long }).q;
    expect(q).toHaveLength(JOB_SEARCH_MAX_LENGTH);
    expect(q).toBe("a".repeat(JOB_SEARCH_MAX_LENGTH));
  });

  it("re-trims after the cap so the slice cannot leave a trailing space", () => {
    const q = parseJobBrowseParams({ q: `${"a".repeat(JOB_SEARCH_MAX_LENGTH - 1)} bbbb` }).q;
    expect(q).toBe("a".repeat(JOB_SEARCH_MAX_LENGTH - 1));
  });

  it("takes the first value when the param is repeated", () => {
    expect(parseJobBrowseParams({ q: ["react", "vue"] }).q).toBe("react");
  });

  it("passes a term through verbatim — the query layer parameterizes it", () => {
    // No sanitizing here: Prisma binds it as a parameter and React escapes it
    // on the way back out. Stripping characters would only break searches for
    // "c++" or "node.js".
    expect(parseJobBrowseParams({ q: "c++ & node.js" }).q).toBe("c++ & node.js");
  });
});

describe("job browse cursor", () => {
  it("round-trips", () => {
    const cursor = { publishedAt: new Date("2026-08-15T10:00:00.000Z"), id: "seedabc123" };
    const decoded = decodeJobBrowseCursor(encodeJobBrowseCursor(cursor));
    expect(decoded).not.toBeNull();
    expect(decoded?.publishedAt.getTime()).toBe(cursor.publishedAt.getTime());
    expect(decoded?.id).toBe(cursor.id);
  });

  it("rejects malformed and tampered cursors", () => {
    expect(decodeJobBrowseCursor(undefined)).toBeNull();
    expect(decodeJobBrowseCursor("")).toBeNull();
    expect(decodeJobBrowseCursor("no-separator")).toBeNull();
    expect(decodeJobBrowseCursor("NaN~abc")).toBeNull();
    expect(decodeJobBrowseCursor("123~id with spaces")).toBeNull();
    expect(decodeJobBrowseCursor("123~<script>")).toBeNull();
    // Implausible timestamps (before 2020 / far future).
    expect(decodeJobBrowseCursor(`${Date.UTC(2019, 0, 1)}~abc`)).toBeNull();
    expect(decodeJobBrowseCursor(`${Date.now() + 7 * 24 * 60 * 60 * 1000}~abc`)).toBeNull();
  });
});
