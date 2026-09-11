import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanTier, RecruiterTier, UserRole } from "@/lib/generated/prisma/enums";

vi.mock("@/lib/db/candidate-search", () => ({ searchCandidates: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ getEntitlementContext: vi.fn() }));

import { searchCandidates } from "@/lib/db/candidate-search";
import { getEntitlementContext } from "@/lib/db/users";

import {
  EXPORT_ROW_LIMIT,
  candidatesToCsv,
  exportCandidatesForUser,
} from "./candidate-export";

const mockSearch = vi.mocked(searchCandidates);
const mockContext = vi.mocked(getEntitlementContext);

const USER = "00000000-0000-4000-8000-000000000002";

const context = (over: Partial<{
  role: UserRole;
  plan: PlanTier;
  recruiterTier: RecruiterTier | null;
  isBanned: boolean;
}> = {}) =>
  ({
    role: "RECRUITER" as UserRole,
    plan: "RECRUITER_TEAM" as PlanTier,
    recruiterTier: "VERIFIED" as RecruiterTier,
    isBanned: false,
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getEntitlementContext>>;

const candidate = (over: Record<string, unknown> = {}) =>
  ({
    id: "fl_1",
    userId: "user_1",
    slug: "jane-cooper",
    displayName: "Jane Cooper",
    headline: "Senior Shopify developer",
    country: "PK",
    timezone: "Asia/Karachi",
    hourlyRateUsd: 45,
    avatarUrl: null,
    verification: "NONE",
    isOpenToWork: true,
    searchBoost: false,
    skills: [{ yearsExp: 6, skill: { slug: "shopify", name: "Shopify" } }],
    ...over,
  }) as never;

const results = (candidates: unknown[], hasMore = false) =>
  ({ candidates, hasMore, nextCursor: null }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  mockContext.mockResolvedValue(context());
  mockSearch.mockResolvedValue(results([candidate()]));
});

describe("candidatesToCsv", () => {
  it("writes a header and one row per candidate", () => {
    const csv = candidatesToCsv([candidate(), candidate({ slug: "b", displayName: "Ada" })]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Name"');
    expect(lines[1]).toContain('"Jane Cooper"');
    expect(lines[2]).toContain('"Ada"');
  });

  it("exports only fields that are already public on the profile page", () => {
    const csv = candidatesToCsv([candidate()]);
    // The two things the search row carries that the public page does not.
    expect(csv).not.toContain("user_1");
    expect(csv).not.toContain("@");
    expect(csv).toContain("/freelancers/jane-cooper");
  });

  it("escapes quotes and commas rather than breaking the row apart", () => {
    const csv = candidatesToCsv([
      candidate({ headline: 'Builds "fast", reliable stores' }),
    ]);
    expect(csv).toContain('"Builds ""fast"", reliable stores"');
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("survives a newline inside a field", () => {
    const csv = candidatesToCsv([candidate({ headline: "line one\nline two" })]);
    // Quoted, so the embedded newline does not start a new record. Splitting on
    // the CRLF the writer emits still yields exactly two.
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("defuses a formula so a headline cannot run in the recruiter's spreadsheet", () => {
    // Every value here is text somebody else wrote. Excel and Sheets evaluate a
    // cell starting = + - @, so this is a code-execution surface, not a
    // formatting nicety.
    for (const dangerous of ['=HYPERLINK("http://evil")', "+1+1", "-2+3", "@SUM(A1)"]) {
      const csv = candidatesToCsv([candidate({ displayName: dangerous })]);
      // Apostrophe-prefixed AND still correctly quote-escaped — the two rules
      // compose, they do not replace each other.
      expect(csv).toContain(`"'${dangerous.replace(/"/g, '""')}"`);
    }
  });

  it("starts with a BOM so Excel reads it as UTF-8", () => {
    // Without it every non-ASCII name arrives mangled, which on this
    // marketplace is most of them.
    expect(candidatesToCsv([candidate({ displayName: "José Álvarez" })]).charCodeAt(0)).toBe(0xfeff);
  });

  it("renders an empty result as a header and nothing else", () => {
    expect(candidatesToCsv([]).trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("joins skills into one cell rather than one column each", () => {
    const csv = candidatesToCsv([
      candidate({
        skills: [
          { yearsExp: 6, skill: { slug: "shopify", name: "Shopify" } },
          { yearsExp: 3, skill: { slug: "react", name: "React" } },
        ],
      }),
    ]);
    expect(csv).toContain('"Shopify; React"');
  });
});

describe("exportCandidatesForUser — two gates", () => {
  it("exports for a Team recruiter", async () => {
    const result = await exportCandidatesForUser(USER, {});
    expect(result).toMatchObject({ ok: true, rows: 1, truncated: false });
  });

  it("refuses Growth — export is Team-only, on top of the search wall", async () => {
    mockContext.mockResolvedValue(context({ plan: "RECRUITER_GROWTH" }));
    expect(await exportCandidatesForUser(USER, {})).toEqual({
      ok: false,
      reason: "team-required",
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refuses a free recruiter at the search wall, before the export gate", async () => {
    mockContext.mockResolvedValue(context({ plan: "FREE" }));
    expect(await exportCandidatesForUser(USER, {})).toEqual({
      ok: false,
      reason: "plan-required",
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refuses a freelancer, whatever plan the row holds", async () => {
    mockContext.mockResolvedValue(context({ role: "FREELANCER", plan: "RECRUITER_TEAM" }));
    expect(await exportCandidatesForUser(USER, {})).toEqual({
      ok: false,
      reason: "not-recruiter",
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refuses a removed employer", async () => {
    mockContext.mockResolvedValue(context({ isBanned: true }));
    expect(await exportCandidatesForUser(USER, {})).toEqual({ ok: false, reason: "banned" });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("refuses an account that no longer exists", async () => {
    mockContext.mockResolvedValue(null);
    expect(await exportCandidatesForUser(USER, {})).toEqual({
      ok: false,
      reason: "not-recruiter",
    });
  });

  it("queries at the export limit, not the page size", async () => {
    await exportCandidatesForUser(USER, {});
    expect(mockSearch).toHaveBeenCalledWith(expect.anything(), EXPORT_ROW_LIMIT);
  });

  it("drops the cursor, so the CSV is the results and not page four", async () => {
    await exportCandidatesForUser(USER, {
      q: "shopify",
      cursor: { searchBoost: true, rank: 0.5, createdAt: new Date(), id: "fl_9" },
    });
    const [filters] = mockSearch.mock.calls[0];
    expect(filters.cursor).toBeUndefined();
    // Every other filter survives: the export is what is on screen.
    expect(filters.q).toBe("shopify");
  });

  it("reports truncation rather than quietly returning a short file", async () => {
    mockSearch.mockResolvedValue(results([candidate()], true));
    expect(await exportCandidatesForUser(USER, {})).toMatchObject({ truncated: true });
  });
});
