import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicJob } from "@/lib/db/job-browse";
import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";

const getPublicJobBySlug = vi.fn();

// The db module is stubbed, so this exercises the route's own decision: which
// jobs it is willing to put on a shareable card.
vi.mock("@/lib/db/job-browse", () => ({
  getPublicJobBySlug: (...args: unknown[]) => getPublicJobBySlug(...args),
}));

// next/og needs Satori and a font pipeline to make a PNG. Here ImageResponse
// just captures the element it was constructed with, so the tests assert on
// what the card SAYS rather than on pixels — which is the thing that leaked.
vi.mock("next/og", () => ({
  ImageResponse: class {
    element: unknown;
    constructor(element: unknown) {
      this.element = element;
    }
  },
}));

import Image from "./opengraph-image";

const HOUR = 60 * 60 * 1000;
const COMPANY = "Northwind Labs";
const TITLE = "Senior Shopify developer";

const job = (over: Partial<PublicJob> = {}): PublicJob =>
  ({
    slug: "senior-shopify-developer",
    title: TITLE,
    status: "ACTIVE",
    // Comfortably outside the window unless a test moves it.
    publishedAt: new Date(Date.now() - 48 * HOUR),
    budgetMinUsd: 4000,
    budgetMaxUsd: 9000,
    isRemote: true,
    location: null,
    recruiter: {
      companyName: COMPANY,
      tier: "VERIFIED",
      isBanned: false,
      deactivatedAt: null,
    },
    ...over,
  }) as unknown as PublicJob;

/** Every string the card renders, flattened. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: unknown } }).props.children);
  }
  return "";
}

const cardFor = async (slug = "senior-shopify-developer"): Promise<string> => {
  // The real return type is ImageResponse; the mock above hands back the
  // captured element instead.
  const result = (await Image({ params: Promise.resolve({ slug }) })) as unknown as {
    element: unknown;
  };
  return textOf(result.element);
};

/** The card carries no trace of the job — title, company or tier label. */
const leaksNothing = (text: string) => {
  expect(text).not.toContain(TITLE);
  expect(text).not.toContain(COMPANY);
  expect(text).not.toMatch(/Unverified employer|Verified employer|Trusted employer/);
  // The generic card still sells the product; a broken image is worse than a
  // generic one.
  expect(text).toContain("Commission-free work on Talent4u");
};

beforeEach(() => {
  vi.clearAllMocks();
  getPublicJobBySlug.mockResolvedValue(job());
});

describe("job OG image", () => {
  it("shows the role, company and tier label for a job anyone can open", async () => {
    const text = await cardFor();
    expect(text).toContain(TITLE);
    expect(text).toContain(COMPANY);
    // CLAUDE.md: the tier is visible wherever a job is presented, and a
    // preview card in a group chat is exactly where a scam post would
    // otherwise look identical to a real one.
    expect(text).toContain("Verified employer");
    expect(text).toContain("$4,000–$9,000");
    expect(text).toContain("Remote");
  });

  it("shows the card for a CLOSED job, which still has a page to share", async () => {
    getPublicJobBySlug.mockResolvedValue(job({ status: "CLOSED" }));
    const text = await cardFor();
    expect(text).toContain(TITLE);
    expect(text).toContain(COMPANY);
  });

  it("leaks nothing for a job whose page 404s", async () => {
    for (const status of ["DRAFT", "PENDING_REVIEW", "REMOVED"] as const) {
      getPublicJobBySlug.mockResolvedValue(job({ status, publishedAt: null }));
      leaksNothing(await cardFor());
    }
  });

  it("leaks nothing for a job the safety scanner is holding", async () => {
    // The dangerous case specifically: held posts keep their slug, and the
    // whole point of the hold is that nobody sees the post yet.
    getPublicJobBySlug.mockResolvedValue(
      job({ status: "PENDING_REVIEW", publishedAt: null, title: "Pay a $200 registration fee" }),
    );
    const text = await cardFor();
    expect(text).not.toContain("registration fee");
    leaksNothing(text);
  });

  it("leaks nothing for a banned or self-deactivated employer", async () => {
    getPublicJobBySlug.mockResolvedValue(job({ recruiter: { ...job().recruiter, isBanned: true } }));
    leaksNothing(await cardFor());

    getPublicJobBySlug.mockResolvedValue(
      job({ recruiter: { ...job().recruiter, deactivatedAt: new Date() } }),
    );
    leaksNothing(await cardFor());
  });

  it("applies the anonymous early-access cutoff, so an in-window job unfurls generically", async () => {
    getPublicJobBySlug.mockResolvedValue(job({ publishedAt: new Date(Date.now() - 60_000) }));
    leaksNothing(await cardFor());
  });

  it("shows a job published just past the window", async () => {
    getPublicJobBySlug.mockResolvedValue(
      job({ publishedAt: new Date(Date.now() - (EARLY_ACCESS_HOURS * HOUR + 60_000)) }),
    );
    expect(await cardFor()).toContain(TITLE);
  });

  it("falls back to the site card for a slug that does not resolve", async () => {
    getPublicJobBySlug.mockResolvedValue(null);
    leaksNothing(await cardFor("no-such-job"));
  });

  it("falls back to the site card rather than erroring when the read fails", async () => {
    getPublicJobBySlug.mockRejectedValue(new Error("connection refused"));
    leaksNothing(await cardFor());
  });
});
