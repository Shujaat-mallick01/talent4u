import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/metrics", () => ({
  jobsWithEarlyTraction: vi.fn(),
  recruitersWhoPostedAgain: vi.fn(),
  freelancersWhoHeardBack: vi.fn(),
  marketplaceScale: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getUserAuthState: vi.fn() }));

import {
  freelancersWhoHeardBack,
  jobsWithEarlyTraction,
  marketplaceScale,
  recruitersWhoPostedAgain,
} from "@/lib/db/metrics";
import { getUserAuthState } from "@/lib/db/users";

import { getMetricsForUser } from "./metrics";

const mockAuth = vi.mocked(getUserAuthState);
const mockTraction = vi.mocked(jobsWithEarlyTraction);
const mockRepeat = vi.mocked(recruitersWhoPostedAgain);
const mockHeard = vi.mocked(freelancersWhoHeardBack);
const mockScale = vi.mocked(marketplaceScale);

const USER = "00000000-0000-4000-8000-000000000001";

const asRole = (role: "ADMIN" | "RECRUITER" | "FREELANCER" | null) =>
  mockAuth.mockResolvedValue(
    role === null
      ? null
      : ({ id: USER, email: "a@example.com", role, hasProfile: true } as never),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockTraction.mockResolvedValue({ hit: 3, total: 10 });
  mockRepeat.mockResolvedValue({ hit: 1, total: 4 });
  mockHeard.mockResolvedValue({ hit: 7, total: 9 });
  mockScale.mockResolvedValue({
    publishedJobs: 10,
    applications: 40,
    companiesWhoPosted: 4,
    freelancersWhoApplied: 12,
  });
});

describe("who may read it", () => {
  it("refuses a recruiter without running a single query", async () => {
    asRole("RECRUITER");
    const result = await getMetricsForUser(USER);
    expect(result).toEqual({ ok: false, reason: "not-admin" });
    // These are commercially sensitive aggregates — "how often are applicants
    // ignored here" is not something a recruiter should read off a URL.
    expect(mockTraction).not.toHaveBeenCalled();
    expect(mockRepeat).not.toHaveBeenCalled();
    expect(mockHeard).not.toHaveBeenCalled();
    expect(mockScale).not.toHaveBeenCalled();
  });

  it("refuses a freelancer and an account that does not exist", async () => {
    asRole("FREELANCER");
    expect(await getMetricsForUser(USER)).toEqual({ ok: false, reason: "not-admin" });
    asRole(null);
    expect(await getMetricsForUser(USER)).toEqual({ ok: false, reason: "not-admin" });
    expect(mockTraction).not.toHaveBeenCalled();
  });

  it("allows an admin", async () => {
    asRole("ADMIN");
    const result = await getMetricsForUser(USER);
    expect(result.ok).toBe(true);
    expect(mockTraction).toHaveBeenCalledOnce();
  });
});

describe("the arithmetic", () => {
  beforeEach(() => asRole("ADMIN"));

  it("reports a percentage of the population that had a chance", async () => {
    const result = await getMetricsForUser(USER);
    if (!result.ok) throw new Error("expected ok");
    const byKey = Object.fromEntries(result.view.measures.map((m) => [m.key, m]));
    expect(byKey.traction.percent).toBe(30);
    expect(byKey.repeat.percent).toBe(25);
    expect(byKey["heard-back"].percent).toBe(78); // 7/9 = 77.8, rounded
  });

  it("reports null rather than 0% when nobody has had a chance yet", async () => {
    mockTraction.mockResolvedValue({ hit: 0, total: 0 });
    const result = await getMetricsForUser(USER);
    if (!result.ok) throw new Error("expected ok");

    const traction = result.view.measures.find((m) => m.key === "traction");
    // The distinction is the whole point: 0% says everyone failed, null says
    // nobody has been given the window. Showing the first when the second is
    // true is how a dashboard starts lying on day one.
    expect(traction?.percent).toBeNull();
    expect(traction?.total).toBe(0);
  });

  it("still reports 0% when the population exists and all of it failed", async () => {
    mockHeard.mockResolvedValue({ hit: 0, total: 12 });
    const result = await getMetricsForUser(USER);
    if (!result.ok) throw new Error("expected ok");
    expect(result.view.measures.find((m) => m.key === "heard-back")?.percent).toBe(0);
  });
});

describe("what it refuses to become", () => {
  beforeEach(() => asRole("ADMIN"));

  it("has no signups counter", async () => {
    const result = await getMetricsForUser(USER);
    if (!result.ok) throw new Error("expected ok");
    // BUILD_PLAN is explicit. A signups number measures marketing, and it only
    // ever goes up, which makes it the easiest thing in the world to mistake
    // for progress.
    const json = JSON.stringify(result.view).toLowerCase();
    expect(json).not.toMatch(/signup|sign-up|registration|new users/);
  });

  it("makes every measure carry its denominator and its caveat", async () => {
    const result = await getMetricsForUser(USER);
    if (!result.ok) throw new Error("expected ok");
    for (const m of result.view.measures) {
      expect(m.denominator.length).toBeGreaterThan(20);
      expect(m.caveat.length).toBeGreaterThan(20);
      expect(m.question.endsWith("?")).toBe(true);
    }
  });
});
