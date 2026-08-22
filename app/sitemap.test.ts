import { beforeEach, describe, expect, it, vi } from "vitest";

const listSitemapJobs = vi.fn();
const listSitemapFreelancers = vi.fn();
const listSitemapCompanies = vi.fn();

// The db module is stubbed, so this exercises the sitemap's own decisions:
// which URLs it advertises, what it dates them with, and which cutoff it
// hands the job query.
vi.mock("@/lib/db/directory", () => ({
  SITEMAP_SECTION_LIMIT: 5000,
  listSitemapJobs: (...args: unknown[]) => listSitemapJobs(...args),
  listSitemapFreelancers: (...args: unknown[]) => listSitemapFreelancers(...args),
  listSitemapCompanies: (...args: unknown[]) => listSitemapCompanies(...args),
}));

// unstable_cache needs Next's server runtime; here it is an identity wrapper
// so the tests exercise the sitemap logic, not the cache plumbing.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";
import { SITE_URL } from "@/lib/site-url";

import sitemap from "./sitemap";

const JOB_UPDATED = new Date("2026-08-21T10:00:00.000Z");
const PROFILE_UPDATED = new Date("2026-08-20T09:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  listSitemapJobs.mockResolvedValue([
    { slug: "senior-shopify-developer", updatedAt: JOB_UPDATED },
    { slug: "rag-pipeline-engineer", updatedAt: new Date("2026-08-19T10:00:00.000Z") },
  ]);
  listSitemapFreelancers.mockResolvedValue([{ slug: "asha-rahman", updatedAt: PROFILE_UPDATED }]);
  listSitemapCompanies.mockResolvedValue([
    { slug: "northwind-labs", updatedAt: new Date("2026-08-18T08:00:00.000Z") },
  ]);
});

const urls = (entries: { url: string }[]) => entries.map((e) => e.url);

describe("sitemap", () => {
  it("lists every public static page, including the legal ones", async () => {
    const entries = await sitemap();
    expect(urls(entries)).toEqual(
      expect.arrayContaining([
        SITE_URL,
        `${SITE_URL}/jobs`,
        `${SITE_URL}/freelancers`,
        `${SITE_URL}/pricing`,
        `${SITE_URL}/removed-employers`,
        `${SITE_URL}/terms`,
        `${SITE_URL}/privacy`,
        `${SITE_URL}/contact`,
      ]),
    );
  });

  it("never advertises a private surface", async () => {
    const entries = await sitemap();
    for (const url of urls(entries)) {
      expect(url).not.toMatch(/\/(dashboard|admin|onboarding|api|dev)(\/|$)/);
    }
  });

  it("advertises every job, profile and company row it was given", async () => {
    const entries = await sitemap();
    expect(urls(entries)).toEqual(
      expect.arrayContaining([
        `${SITE_URL}/jobs/senior-shopify-developer`,
        `${SITE_URL}/jobs/rag-pipeline-engineer`,
        `${SITE_URL}/freelancers/asha-rahman`,
        `${SITE_URL}/companies/northwind-labs`,
      ]),
    );
  });

  it("applies the anonymous early-access cutoff to the job query", async () => {
    // A crawler is logged out, so a job published minutes ago 404s for it.
    const before = Date.now();
    await sitemap();
    const cutoff = listSitemapJobs.mock.calls[0][0] as Date;
    const windowMs = EARLY_ACCESS_HOURS * 60 * 60 * 1000;
    const BUCKET_MS = 15 * 60 * 1000;
    expect(cutoff).toBeInstanceOf(Date);
    // The cutoff is quantized to 15-minute buckets so it can serve as a
    // stable cache key — up to one bucket earlier than the exact boundary.
    expect(cutoff.getTime() % BUCKET_MS).toBe(0);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - windowMs - BUCKET_MS - 5_000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - windowMs + 5_000);
  });

  it("dates each row from its own updatedAt", async () => {
    const entries = await sitemap();
    const job = entries.find((e) => e.url === `${SITE_URL}/jobs/senior-shopify-developer`);
    const profile = entries.find((e) => e.url === `${SITE_URL}/freelancers/asha-rahman`);
    expect(job?.lastModified).toEqual(JOB_UPDATED);
    expect(profile?.lastModified).toEqual(PROFILE_UPDATED);
  });

  it("dates the index pages from the newest row they list", async () => {
    const entries = await sitemap();
    const jobsIndex = entries.find((e) => e.url === `${SITE_URL}/jobs`);
    expect(jobsIndex?.lastModified).toEqual(JOB_UPDATED);
  });

  it("claims no modification date for pages that have no revision record", async () => {
    const entries = await sitemap();
    for (const path of ["/terms", "/privacy", "/contact", "/pricing"]) {
      expect(entries.find((e) => e.url === `${SITE_URL}${path}`)?.lastModified).toBeUndefined();
    }
  });

  it("still returns the static pages when the database has nothing", async () => {
    listSitemapJobs.mockResolvedValue([]);
    listSitemapFreelancers.mockResolvedValue([]);
    listSitemapCompanies.mockResolvedValue([]);
    const entries = await sitemap();
    expect(entries).toHaveLength(8);
    expect(entries.find((e) => e.url === `${SITE_URL}/jobs`)?.lastModified).toBeUndefined();
  });

  it("advertises each URL exactly once", async () => {
    const entries = await sitemap();
    expect(new Set(urls(entries)).size).toBe(entries.length);
  });
});
