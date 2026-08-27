import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/candidate-search", () => ({
  searchCandidates: vi.fn(),
  candidateCountries: vi.fn(),
}));

vi.mock("@/lib/db/users", () => ({
  getEntitlementContext: vi.fn(),
}));

// These two are pulled in for the outreach affordances on each row. Without
// mocking them the "unit" tests reach a real Postgres — tests/setup.ts loads
// .env, so DATABASE_URL is set and the query simply succeeds, which is how a
// test that claims the database is never touched can pass while touching it.
vi.mock("@/lib/db/job", () => ({
  listOpenJobsForRecruiterUser: vi.fn(),
}));

vi.mock("@/lib/db/message", () => ({
  mapOutreachThreads: vi.fn(),
}));

import { candidateCountries, searchCandidates } from "@/lib/db/candidate-search";
import { listOpenJobsForRecruiterUser } from "@/lib/db/job";
import { mapOutreachThreads } from "@/lib/db/message";
import { getEntitlementContext } from "@/lib/db/users";
import type { PlanTier, RecruiterTier, UserRole } from "@/lib/generated/prisma/enums";

import { canSearchCandidates, searchCandidatesForUser } from "./candidate-search";

/**
 * The paid wall, from the only angle that matters: does the database get asked?
 *
 * CLAUDE.md — "Candidate search is the paid wall. Free recruiters must never
 * reach search, filters, or outbound messaging." A gate that runs the query and
 * then hides the rows still leaks: response timing, a result count, and one
 * bug away from rendering them. So every refusal below asserts that
 * `searchCandidates` was never called, not merely that nothing came back.
 */

const mockContext = vi.mocked(getEntitlementContext);
const mockSearch = vi.mocked(searchCandidates);
const mockCountries = vi.mocked(candidateCountries);
const mockJobs = vi.mocked(listOpenJobsForRecruiterUser);
const mockThreads = vi.mocked(mapOutreachThreads);

const USER = "00000000-0000-4000-8000-000000000001";

const context = (over: Partial<{
  role: UserRole;
  plan: PlanTier;
  recruiterTier: RecruiterTier | null;
  isBanned: boolean;
}> = {}) => ({
  role: "RECRUITER" as UserRole,
  plan: "RECRUITER_GROWTH" as PlanTier,
  billingCountry: "GB",
  recruiterTier: "VERIFIED" as RecruiterTier | null,
  isBanned: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSearch.mockResolvedValue({ candidates: [], hasMore: false, nextCursor: null });
  mockCountries.mockResolvedValue(["GB", "PK"]);
  mockJobs.mockResolvedValue([]);
  mockThreads.mockResolvedValue(new Map());
});

describe("the paid wall", () => {
  it("refuses a free recruiter WITHOUT touching the database", async () => {
    mockContext.mockResolvedValue(context({ plan: "FREE" }));

    const result = await searchCandidatesForUser(USER, {});

    expect(result).toEqual({ ok: false, reason: "plan-required" });
    // The point of the test: not one query runs, of any kind.
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockCountries).not.toHaveBeenCalled();
    expect(mockJobs).not.toHaveBeenCalled();
    expect(mockThreads).not.toHaveBeenCalled();
  });

  it("refuses a free recruiter however verified they are", async () => {
    // Verification buys messaging and post capacity, never search.
    for (const recruiterTier of ["UNVERIFIED", "VERIFIED", "TRUSTED"] as const) {
      vi.clearAllMocks();
      mockContext.mockResolvedValue(context({ plan: "FREE", recruiterTier }));
      const result = await searchCandidatesForUser(USER, {});
      expect(result).toEqual({ ok: false, reason: "plan-required" });
      expect(mockSearch).not.toHaveBeenCalled();
    }
  });

  it("refuses a free recruiter who hand-writes filters into the URL", async () => {
    mockContext.mockResolvedValue(context({ plan: "FREE" }));

    const result = await searchCandidatesForUser(USER, {
      q: "react",
      skillSlugs: ["react", "typescript"],
      country: "PK",
      rateMin: 10,
      rateMax: 90,
      openToWork: true,
    });

    expect(result).toEqual({ ok: false, reason: "plan-required" });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("opens on Growth and on Team", async () => {
    for (const plan of ["RECRUITER_GROWTH", "RECRUITER_TEAM"] as const) {
      vi.clearAllMocks();
      mockSearch.mockResolvedValue({ candidates: [], hasMore: false, nextCursor: null });
      mockCountries.mockResolvedValue(["GB"]);
      mockContext.mockResolvedValue(context({ plan }));

      const result = await searchCandidatesForUser(USER, {});
      expect(result.ok).toBe(true);
      expect(mockSearch).toHaveBeenCalledOnce();
    }
  });

  it("is not opened by a freelancer plan on a recruiter account", async () => {
    mockContext.mockResolvedValue(context({ plan: "FREELANCER_PRO" }));
    const result = await searchCandidatesForUser(USER, {});
    expect(result).toEqual({ ok: false, reason: "plan-required" });
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

describe("who else is refused", () => {
  it("refuses a freelancer, whatever they pay", async () => {
    mockContext.mockResolvedValue(context({ role: "FREELANCER", plan: "RECRUITER_TEAM" }));
    const result = await searchCandidatesForUser(USER, {});
    expect(result).toEqual({ ok: false, reason: "not-recruiter" });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refuses an admin", async () => {
    mockContext.mockResolvedValue(context({ role: "ADMIN" }));
    expect(await searchCandidatesForUser(USER, {})).toEqual({ ok: false, reason: "not-recruiter" });
  });

  it("refuses an account that does not exist", async () => {
    mockContext.mockResolvedValue(null);
    expect(await searchCandidatesForUser(USER, {})).toEqual({ ok: false, reason: "not-recruiter" });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refuses a removed employer even on a paid plan", async () => {
    // The ban has to bite here too. Publishing and messaging already refuse
    // them, so search would be the one capability a removed employer kept.
    mockContext.mockResolvedValue(context({ plan: "RECRUITER_TEAM", isBanned: true }));
    const result = await searchCandidatesForUser(USER, {});
    expect(result).toEqual({ ok: false, reason: "banned" });
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

describe("the result", () => {
  it("passes the filters straight through to the query", async () => {
    mockContext.mockResolvedValue(context());
    const filters = { q: "shopify", country: "PK", rateMax: 60 };
    await searchCandidatesForUser(USER, filters);
    expect(mockSearch).toHaveBeenCalledWith(filters);
  });

  it("drops the next cursor when there is no next page", async () => {
    mockContext.mockResolvedValue(context());
    mockSearch.mockResolvedValue({
      candidates: [],
      hasMore: false,
      nextCursor: { searchBoost: true, rank: 0.5, createdAt: new Date(), id: "c1" },
    });
    const result = await searchCandidatesForUser(USER, {});
    // A "Next page" link that leads to an empty page is worse than no link.
    expect(result.ok && result.view.nextCursor).toBeNull();
  });

  it("keeps the cursor when there is one", async () => {
    mockContext.mockResolvedValue(context());
    const cursor = { searchBoost: false, rank: 0.1, createdAt: new Date(), id: "c9" };
    mockSearch.mockResolvedValue({ candidates: [], hasMore: true, nextCursor: cursor });
    const result = await searchCandidatesForUser(USER, {});
    expect(result.ok && result.view.nextCursor).toEqual(cursor);
  });
});

describe("canSearchCandidates", () => {
  it("agrees with the real gate on every plan", async () => {
    for (const [plan, expected] of [
      ["FREE", false],
      ["FREELANCER_PRO", false],
      ["RECRUITER_GROWTH", true],
      ["RECRUITER_TEAM", true],
    ] as const) {
      mockContext.mockResolvedValue(context({ plan }));
      expect(await canSearchCandidates(USER)).toBe(expected);
    }
  });

  it("is false for a banned recruiter and for a freelancer", async () => {
    mockContext.mockResolvedValue(context({ isBanned: true }));
    expect(await canSearchCandidates(USER)).toBe(false);
    mockContext.mockResolvedValue(context({ role: "FREELANCER" }));
    expect(await canSearchCandidates(USER)).toBe(false);
  });
});
