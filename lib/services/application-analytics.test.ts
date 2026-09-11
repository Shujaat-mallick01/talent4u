import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanTier, UserRole } from "@/lib/generated/prisma/enums";

vi.mock("@/lib/db/application", () => ({ getApplicationOutcomeStats: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getEntitlementContext: vi.fn(),
  getFreelancerProfileByUserId: vi.fn(),
}));

import { getApplicationOutcomeStats } from "@/lib/db/application";
import { getEntitlementContext, getFreelancerProfileByUserId } from "@/lib/db/users";

import { getApplicationAnalyticsForUser } from "./application-analytics";

const mockStats = vi.mocked(getApplicationOutcomeStats);
const mockContext = vi.mocked(getEntitlementContext);
const mockProfile = vi.mocked(getFreelancerProfileByUserId);

const USER = "00000000-0000-4000-8000-000000000001";

const context = (over: Partial<{ role: UserRole; plan: PlanTier }> = {}) =>
  ({
    role: "FREELANCER" as UserRole,
    plan: "FREELANCER_PRO" as PlanTier,
    recruiterTier: null,
    isBanned: false,
    billingCountry: "PK",
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getEntitlementContext>>;

const stats = (over: Record<string, unknown> = {}) => ({
  sent: 20,
  viewed: 15,
  decided: 5,
  heardBack: 8,
  medianResponseDays: 3.5,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mockContext.mockResolvedValue(context());
  mockProfile.mockResolvedValue({ id: "fl_1" } as never);
  mockStats.mockResolvedValue(stats());
});

describe("the analytics gate", () => {
  it("computes for a Pro freelancer", async () => {
    const result = await getApplicationAnalyticsForUser(USER);
    expect(result).toMatchObject({ ok: true, analytics: { sent: 20, heardBack: 8 } });
  });

  it("refuses a free freelancer WITHOUT running the query", async () => {
    mockContext.mockResolvedValue(context({ plan: "FREE" }));
    expect(await getApplicationAnalyticsForUser(USER)).toEqual({
      ok: false,
      reason: "plan-required",
    });
    // The panel is an upsell for them; the numbers are never computed.
    expect(mockStats).not.toHaveBeenCalled();
    expect(mockProfile).not.toHaveBeenCalled();
  });

  it("refuses a recruiter holding a FREELANCER_PRO row", async () => {
    // getEntitlements already scopes Pro perks to the freelancer role; this
    // pins that the service does not work around it.
    mockContext.mockResolvedValue(context({ role: "RECRUITER" }));
    expect(await getApplicationAnalyticsForUser(USER)).toEqual({
      ok: false,
      reason: "not-freelancer",
    });
    expect(mockStats).not.toHaveBeenCalled();
  });

  it("refuses an account that no longer exists", async () => {
    mockContext.mockResolvedValue(null);
    expect(await getApplicationAnalyticsForUser(USER)).toEqual({
      ok: false,
      reason: "not-freelancer",
    });
  });

  it("refuses before onboarding is finished", async () => {
    mockProfile.mockResolvedValue(null);
    expect(await getApplicationAnalyticsForUser(USER)).toEqual({ ok: false, reason: "no-profile" });
  });

  it("scopes the query to the caller's own profile, never an id from a request", async () => {
    await getApplicationAnalyticsForUser(USER);
    expect(mockStats).toHaveBeenCalledWith({ freelancerId: "fl_1", userId: USER });
  });
});

describe("the percentages", () => {
  it("rounds against applications sent", async () => {
    mockStats.mockResolvedValue(stats({ sent: 20, viewed: 15, heardBack: 8 }));
    const result = await getApplicationAnalyticsForUser(USER);
    expect(result).toMatchObject({
      ok: true,
      analytics: { viewedPercent: 75, heardBackPercent: 40 },
    });
  });

  it("is null rather than 0% for somebody who has not applied yet", async () => {
    // 0% reads as "nobody answered you". Null lets the page say "no
    // applications yet", which is a different and true sentence.
    mockStats.mockResolvedValue(stats({ sent: 0, viewed: 0, decided: 0, heardBack: 0, medianResponseDays: null }));
    const result = await getApplicationAnalyticsForUser(USER);
    expect(result).toMatchObject({
      ok: true,
      analytics: { viewedPercent: null, heardBackPercent: null, medianResponseDays: null },
    });
  });

  it("passes a null median through rather than inventing a zero", async () => {
    // Nobody has responded yet. "0 days" would be the most flattering possible
    // lie about exactly that situation.
    mockStats.mockResolvedValue(stats({ heardBack: 0, medianResponseDays: null }));
    const result = await getApplicationAnalyticsForUser(USER);
    expect(result).toMatchObject({ ok: true, analytics: { medianResponseDays: null } });
  });

  it("never reports more responses than applications", async () => {
    const result = await getApplicationAnalyticsForUser(USER);
    if (!result.ok) throw new Error("expected ok");
    const { sent, viewed, decided, heardBack } = result.analytics;
    expect(viewed).toBeLessThanOrEqual(sent);
    expect(heardBack).toBeLessThanOrEqual(sent);
    expect(decided).toBeLessThanOrEqual(heardBack);
  });
});
