import { beforeEach, describe, expect, it, vi } from "vitest";

const { FakeKnownRequestError } = vi.hoisted(() => {
  class FakeKnownRequestError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message);
    }
  }
  return { FakeKnownRequestError };
});
vi.mock("@/lib/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
}));

vi.mock("@/lib/db/application", () => ({
  applyToJobTx: vi.fn(),
  countApplicationsSince: vi.fn(),
  nthOldestApplicationSince: vi.fn(),
}));
vi.mock("@/lib/db/job-browse", () => ({ getPublicJobBySlug: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getFreelancerProfileByUserId: vi.fn(),
  getUserPlan: vi.fn(),
}));

import {
  applyToJobTx,
  countApplicationsSince,
  nthOldestApplicationSince,
} from "@/lib/db/application";
import { getPublicJobBySlug } from "@/lib/db/job-browse";
import { getFreelancerProfileByUserId, getUserPlan } from "@/lib/db/users";

import {
  applyToJob,
  getApplicationQuotaStatus,
  windowStartFrom,
} from "./application";

const mockProfile = vi.mocked(getFreelancerProfileByUserId);
const mockPlan = vi.mocked(getUserPlan);
const mockJob = vi.mocked(getPublicJobBySlug);
const mockTx = vi.mocked(applyToJobTx);
const mockCount = vi.mocked(countApplicationsSince);
const mockNthOldest = vi.mocked(nthOldestApplicationSince);

const USER_ID = "00000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-08-20T12:00:00.000Z");

const profile = () =>
  ({ id: "fp_1" }) as Awaited<ReturnType<typeof getFreelancerProfileByUserId>>;
const job = () => ({ id: "job_1" }) as Awaited<ReturnType<typeof getPublicJobBySlug>>;

const input = { coverLetter: "c".repeat(120), proposedRateUsd: 45 };

beforeEach(() => vi.resetAllMocks());

describe("windowStartFrom", () => {
  it("is exactly 30 days before now", () => {
    expect(windowStartFrom(NOW).toISOString()).toBe("2026-07-21T12:00:00.000Z");
  });
});

describe("getApplicationQuotaStatus", () => {
  it("refuses a caller with no freelancer profile", async () => {
    mockProfile.mockResolvedValue(null);
    expect(await getApplicationQuotaStatus(USER_ID, NOW)).toEqual({
      ok: false,
      reason: "no-freelancer-profile",
    });
  });

  it("reports the free tier with slots remaining and no wait time", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("FREE");
    mockCount.mockResolvedValue(9);

    const status = await getApplicationQuotaStatus(USER_ID, NOW);
    expect(status).toMatchObject({
      plan: "FREE",
      limit: 12,
      used: 9,
      remaining: 3,
      nextSlotFreesAt: null,
    });
    expect(mockNthOldest).not.toHaveBeenCalled();
    // The count window starts exactly 30 days back.
    expect(mockCount.mock.calls[0][1].toISOString()).toBe("2026-07-21T12:00:00.000Z");
  });

  it("at the limit, the NEXT slot frees when the (used-limit+1)-th oldest ages out", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("FREE");
    mockCount.mockResolvedValue(12);
    mockNthOldest.mockResolvedValue(new Date("2026-07-25T12:00:00.000Z"));

    const status = await getApplicationQuotaStatus(USER_ID, NOW);
    expect(status).toMatchObject({ used: 12, remaining: 0 });
    if ("nextSlotFreesAt" in status) {
      expect(status.nextSlotFreesAt?.toISOString()).toBe("2026-08-24T12:00:00.000Z");
    }
    // skip = used - limit = 0 -> the oldest.
    expect(mockNthOldest.mock.calls[0][2]).toBe(0);
  });

  it("a lapsed Pro far over the limit waits on the (used-limit+1)-th oldest, not the oldest", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("FREE"); // lapsed Pro falls back to FREE
    mockCount.mockResolvedValue(40);
    mockNthOldest.mockResolvedValue(new Date("2026-08-10T12:00:00.000Z"));

    const status = await getApplicationQuotaStatus(USER_ID, NOW);
    expect(status).toMatchObject({ used: 40, remaining: 0 });
    // skip = 40 - 12 = 28: the 29th-oldest application gates the next slot.
    expect(mockNthOldest.mock.calls[0][2]).toBe(28);
  });

  it("reports unlimited for Pro without an expiry lookup", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("FREELANCER_PRO");
    mockCount.mockResolvedValue(40);

    const status = await getApplicationQuotaStatus(USER_ID, NOW);
    expect(status).toMatchObject({ limit: null, used: 40, remaining: null, nextSlotFreesAt: null });
    expect(mockNthOldest).not.toHaveBeenCalled();
  });
});

describe("applyToJob", () => {
  it("refuses a caller with no freelancer profile", async () => {
    mockProfile.mockResolvedValue(null);
    expect(await applyToJob(USER_ID, "some-job", input, NOW)).toEqual({
      ok: false,
      reason: "no-freelancer-profile",
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("reports job-not-available for an unknown slug", async () => {
    mockProfile.mockResolvedValue(profile());
    mockJob.mockResolvedValue(null);
    expect(await applyToJob(USER_ID, "nope", input, NOW)).toEqual({
      ok: false,
      reason: "job-not-available",
    });
  });

  it("passes the free tier's quota and early-access cutoff into the transaction", async () => {
    mockProfile.mockResolvedValue(profile());
    mockJob.mockResolvedValue(job());
    mockPlan.mockResolvedValue("FREE");
    mockTx.mockResolvedValue({ ok: true, applicationId: "app_1", used: 5 });

    const result = await applyToJob(USER_ID, "some-job", input, NOW);
    expect(result).toEqual({ ok: true, applicationId: "app_1", remaining: 7 });

    const args = mockTx.mock.calls[0][0];
    expect(args.quota).toBe(12);
    expect(args.windowStart.toISOString()).toBe("2026-07-21T12:00:00.000Z");
    // Free viewers get the 6h cutoff, so an inside-window job is unapplicable.
    expect(args.earlyAccessCutoff?.toISOString()).toBe("2026-08-20T06:00:00.000Z");
  });

  it("passes unlimited quota and no cutoff for Pro", async () => {
    mockProfile.mockResolvedValue(profile());
    mockJob.mockResolvedValue(job());
    mockPlan.mockResolvedValue("FREELANCER_PRO");
    mockTx.mockResolvedValue({ ok: true, applicationId: "app_1", used: 99 });

    const result = await applyToJob(USER_ID, "some-job", input, NOW);
    expect(result).toEqual({ ok: true, applicationId: "app_1", remaining: null });
    expect(mockTx.mock.calls[0][0].quota).toBeNull();
    expect(mockTx.mock.calls[0][0].earlyAccessCutoff).toBeNull();
  });

  it("maps a quota rejection to the typed error with limit and used", async () => {
    mockProfile.mockResolvedValue(profile());
    mockJob.mockResolvedValue(job());
    mockPlan.mockResolvedValue("FREE");
    mockTx.mockResolvedValue({ ok: false, reason: "quota-exceeded", used: 12 });

    expect(await applyToJob(USER_ID, "some-job", input, NOW)).toEqual({
      ok: false,
      reason: "quota-exceeded",
      limit: 12,
      used: 12,
    });
  });

  it("maps a lock-wait timeout (P2028) to a retryable conflict, not a throw", async () => {
    mockProfile.mockResolvedValue(profile());
    mockJob.mockResolvedValue(job());
    mockPlan.mockResolvedValue("FREE");
    mockTx.mockRejectedValue(new FakeKnownRequestError("timeout", "P2028"));
    expect(await applyToJob(USER_ID, "some-job", input, NOW)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("maps already-applied and job-not-available through", async () => {
    mockProfile.mockResolvedValue(profile());
    mockJob.mockResolvedValue(job());
    mockPlan.mockResolvedValue("FREE");
    mockTx.mockResolvedValue({ ok: false, reason: "already-applied" });
    expect(await applyToJob(USER_ID, "some-job", input, NOW)).toEqual({
      ok: false,
      reason: "already-applied",
    });
    mockTx.mockResolvedValue({ ok: false, reason: "job-not-available" });
    expect(await applyToJob(USER_ID, "some-job", input, NOW)).toEqual({
      ok: false,
      reason: "job-not-available",
    });
  });
});
