import { describe, expect, it, vi } from "vitest";

// The predicates and the page parser are pure; stub the client module so
// importing this file never needs DATABASE_URL or the generated engine.
vi.mock("./client", () => ({ prisma: {} }));

import {
  FREELANCER_DIRECTORY_MAX_PAGE,
  PUBLIC_FREELANCER_WHERE,
  SITEMAP_COMPANY_WHERE,
  SITEMAP_FREELANCER_WHERE,
  parseDirectoryPage,
  sitemapJobWhere,
} from "./directory";

const CUTOFF = new Date("2026-08-22T06:00:00.000Z");

describe("sitemapJobWhere", () => {
  it("lists ACTIVE jobs only", () => {
    expect(sitemapJobWhere(CUTOFF).AND).toContainEqual({ status: "ACTIVE" });
  });

  it("excludes banned and self-deactivated employers", () => {
    // A banned employer's jobs are REMOVED and their page is delisted; a
    // deactivated one 404s. Either way the URL must not be advertised.
    expect(sitemapJobWhere(CUTOFF).AND).toContainEqual({
      recruiter: { isBanned: false, deactivatedAt: null },
    });
  });

  it("excludes jobs still inside the early-access window", () => {
    // A crawler is anonymous, so a job published inside the window 404s for
    // it. Listing it would be advertising a soft 404.
    expect(sitemapJobWhere(CUTOFF).AND).toContainEqual({ publishedAt: { lte: CUTOFF } });
  });

  it("applies no publishedAt bound when there is no cutoff", () => {
    expect(JSON.stringify(sitemapJobWhere(null))).not.toContain("publishedAt");
  });
});

describe("sitemap profile predicates", () => {
  it("lists freelancer profiles that are not deactivated, open to work or not", () => {
    // Being closed to work does not delist the page — /freelancers/[slug]
    // still renders it — so only deactivation removes it from the sitemap.
    expect(SITEMAP_FREELANCER_WHERE).toEqual({ deactivatedAt: null });
    expect(SITEMAP_FREELANCER_WHERE).not.toHaveProperty("isOpenToWork");
  });

  it("excludes banned and deactivated companies", () => {
    expect(SITEMAP_COMPANY_WHERE).toEqual({ isBanned: false, deactivatedAt: null });
  });
});

describe("PUBLIC_FREELANCER_WHERE", () => {
  it("indexes only live profiles that say they are open to work", () => {
    expect(PUBLIC_FREELANCER_WHERE).toEqual({ deactivatedAt: null, isOpenToWork: true });
  });
});

describe("parseDirectoryPage", () => {
  it("defaults to page 1 when absent or empty", () => {
    expect(parseDirectoryPage(undefined)).toBe(1);
    expect(parseDirectoryPage("")).toBe(1);
    expect(parseDirectoryPage("   ")).toBe(1);
  });

  it("reads a plain page number", () => {
    expect(parseDirectoryPage("2")).toBe(2);
    expect(parseDirectoryPage("17")).toBe(17);
  });

  it("takes the first value when the param repeats", () => {
    expect(parseDirectoryPage(["3", "9"])).toBe(3);
  });

  it("falls back to page 1 on anything that is not a page number", () => {
    // These URLs are shared and crawled: junk resolves to page 1 rather than
    // erroring, exactly as the browse filters do.
    for (const raw of ["abc", "-2", "0", "2.5", "2e9", " 2 x", "NaN", "1;DROP"]) {
      expect(parseDirectoryPage(raw)).toBe(1);
    }
  });

  it("clamps deep pages to the maximum offset we will scan", () => {
    expect(parseDirectoryPage("999999")).toBe(FREELANCER_DIRECTORY_MAX_PAGE);
    expect(parseDirectoryPage(String(FREELANCER_DIRECTORY_MAX_PAGE))).toBe(
      FREELANCER_DIRECTORY_MAX_PAGE,
    );
  });
});
