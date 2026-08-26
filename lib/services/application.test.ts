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
// Notifications are a side effect; this suite tests the decision itself.
vi.mock("./notify", () => ({ onApplicationDecided: vi.fn(), onApplicationSubmitted: vi.fn() }));

vi.mock("@/lib/db/application", () => ({
  applyToJobTx: vi.fn(),
  countApplicationsSince: vi.fn(),
  nthOldestApplicationSince: vi.fn(),
  getJobWithApplicationsForRecruiter: vi.fn(),
  markSubmittedApplicationsViewed: vi.fn(),
  setApplicationNoteForRecruiter: vi.fn(),
  updateApplicationStatusForRecruiter: vi.fn(),
}));
vi.mock("@/lib/db/job-browse", () => ({ getPublicJobBySlug: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  getFreelancerProfileByUserId: vi.fn(),
  getRecruiterProfileByUserId: vi.fn(),
  getUserPlan: vi.fn(),
}));

import {
  applyToJobTx,
  countApplicationsSince,
  getJobWithApplicationsForRecruiter,
  markSubmittedApplicationsViewed,
  nthOldestApplicationSince,
  setApplicationNoteForRecruiter,
  updateApplicationStatusForRecruiter,
} from "@/lib/db/application";
import { getPublicJobBySlug } from "@/lib/db/job-browse";
import {
  getFreelancerProfileByUserId,
  getRecruiterProfileByUserId,
  getUserPlan,
} from "@/lib/db/users";

import {
  applyToJob,
  canRecruiterTransition,
  getApplicationQuotaStatus,
  getJobInboxForUser,
  notesAllowedForRecruiter,
  recruiterTransitionSources,
  setApplicationNoteForUser,
  setApplicationStatusForUser,
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

describe("recruiter transition matrix", () => {
  it("allows the documented moves and nothing else", () => {
    expect(canRecruiterTransition("SUBMITTED", "VIEWED")).toBe(true);
    expect(canRecruiterTransition("SUBMITTED", "SHORTLISTED")).toBe(true);
    expect(canRecruiterTransition("SUBMITTED", "REJECTED")).toBe(true);
    expect(canRecruiterTransition("VIEWED", "SHORTLISTED")).toBe(true);
    expect(canRecruiterTransition("VIEWED", "REJECTED")).toBe(true);
    expect(canRecruiterTransition("SHORTLISTED", "REJECTED")).toBe(true);
    expect(canRecruiterTransition("REJECTED", "SHORTLISTED")).toBe(true);
  });

  it("makes WITHDRAWN terminal for the recruiter", () => {
    for (const to of ["VIEWED", "SHORTLISTED", "REJECTED", "SUBMITTED"] as const) {
      expect(canRecruiterTransition("WITHDRAWN", to)).toBe(false);
    }
  });

  it("never returns to SUBMITTED", () => {
    for (const from of ["VIEWED", "SHORTLISTED", "REJECTED", "WITHDRAWN"] as const) {
      expect(canRecruiterTransition(from, "SUBMITTED")).toBe(false);
    }
  });

  it("computes the legal sources for each decision", () => {
    expect(recruiterTransitionSources("SHORTLISTED").sort()).toEqual(
      ["REJECTED", "SUBMITTED", "VIEWED"].sort(),
    );
    expect(recruiterTransitionSources("REJECTED").sort()).toEqual(
      ["SHORTLISTED", "SUBMITTED", "VIEWED"].sort(),
    );
  });
});

describe("notesAllowedForRecruiter", () => {
  it("gates notes to Growth and Team", () => {
    expect(notesAllowedForRecruiter("FREE")).toBe(false);
    expect(notesAllowedForRecruiter("FREELANCER_PRO")).toBe(false);
    expect(notesAllowedForRecruiter("RECRUITER_GROWTH")).toBe(true);
    expect(notesAllowedForRecruiter("RECRUITER_TEAM")).toBe(true);
  });
});

describe("setApplicationNoteForUser", () => {
  const mockRecruiter = vi.mocked(getRecruiterProfileByUserId);
  const mockSetNote = vi.mocked(setApplicationNoteForRecruiter);
  const recruiter = (over: Record<string, unknown> = {}) =>
    ({ id: "rec_1", isBanned: false, ...over }) as Awaited<
      ReturnType<typeof getRecruiterProfileByUserId>
    >;

  it("refuses the Free plan with a typed plan-required error (server-side wall)", async () => {
    mockRecruiter.mockResolvedValue(recruiter());
    mockPlan.mockResolvedValue("FREE");
    expect(await setApplicationNoteForUser(USER_ID, "app_1", "great fit")).toEqual({
      ok: false,
      reason: "plan-required",
    });
    expect(mockSetNote).not.toHaveBeenCalled();
  });

  it("saves for Growth, ownership-scoped", async () => {
    mockRecruiter.mockResolvedValue(recruiter());
    mockPlan.mockResolvedValue("RECRUITER_GROWTH");
    mockSetNote.mockResolvedValue(true);
    expect(await setApplicationNoteForUser(USER_ID, "app_1", "great fit")).toEqual({ ok: true });
    expect(mockSetNote).toHaveBeenCalledWith("app_1", "rec_1", "great fit");
  });

  it("refuses a banned recruiter", async () => {
    mockRecruiter.mockResolvedValue(recruiter({ isBanned: true }));
    expect(await setApplicationNoteForUser(USER_ID, "app_1", "x")).toEqual({
      ok: false,
      reason: "banned",
    });
  });
});

describe("setApplicationStatusForUser", () => {
  const mockRecruiter = vi.mocked(getRecruiterProfileByUserId);
  const mockUpdate = vi.mocked(updateApplicationStatusForRecruiter);
  const recruiter = () =>
    ({ id: "rec_1", isBanned: false }) as Awaited<ReturnType<typeof getRecruiterProfileByUserId>>;

  it("passes the legal source-statuses into the ownership-scoped update", async () => {
    mockRecruiter.mockResolvedValue(recruiter());
    mockPlan.mockResolvedValue("FREE");
    mockUpdate.mockResolvedValue(true);
    expect(await setApplicationStatusForUser(USER_ID, "app_1", "SHORTLISTED")).toEqual({ ok: true });
    const args = mockUpdate.mock.calls[0][0];
    expect(args.recruiterId).toBe("rec_1");
    expect(args.to).toBe("SHORTLISTED");
    expect([...args.allowedFrom].sort()).toEqual(["REJECTED", "SUBMITTED", "VIEWED"].sort());
  });

  it("maps a refused update (not owned / withdrawn / raced) to invalid-transition", async () => {
    mockRecruiter.mockResolvedValue(recruiter());
    mockPlan.mockResolvedValue("FREE");
    mockUpdate.mockResolvedValue(false);
    expect(await setApplicationStatusForUser(USER_ID, "app_1", "REJECTED")).toEqual({
      ok: false,
      reason: "invalid-transition",
    });
  });
});

describe("getJobInboxForUser", () => {
  const mockRecruiter = vi.mocked(getRecruiterProfileByUserId);
  const mockMarkViewed = vi.mocked(markSubmittedApplicationsViewed);
  const mockGetInbox = vi.mocked(getJobWithApplicationsForRecruiter);
  const recruiter = (over: Record<string, unknown> = {}) =>
    ({ id: "rec_1", isBanned: false, ...over }) as Awaited<
      ReturnType<typeof getRecruiterProfileByUserId>
    >;
  const inboxJob = () =>
    ({ id: "job_1", applications: [] }) as unknown as Awaited<
      ReturnType<typeof getJobWithApplicationsForRecruiter>
    >;

  it("rejects an implausible id before touching the database", async () => {
    // A NUL byte would make Postgres throw 22021 — a 500, not a 404.
    const result = await getJobInboxForUser(USER_ID, `abc${String.fromCharCode(0)}def`);
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(mockRecruiter).not.toHaveBeenCalled();
    expect(mockMarkViewed).not.toHaveBeenCalled();
  });

  it("refuses a caller with no recruiter profile", async () => {
    mockRecruiter.mockResolvedValue(null);
    expect(await getJobInboxForUser(USER_ID, "job1")).toEqual({
      ok: false,
      reason: "no-recruiter-profile",
    });
    expect(mockMarkViewed).not.toHaveBeenCalled();
  });

  it("refuses a banned recruiter", async () => {
    mockRecruiter.mockResolvedValue(recruiter({ isBanned: true }));
    expect(await getJobInboxForUser(USER_ID, "job1")).toEqual({ ok: false, reason: "banned" });
    expect(mockMarkViewed).not.toHaveBeenCalled();
  });

  it("marks SUBMITTED applications viewed BEFORE reading the list, scoped to the owner", async () => {
    mockRecruiter.mockResolvedValue(recruiter());
    mockPlan.mockResolvedValue("RECRUITER_GROWTH");
    mockMarkViewed.mockResolvedValue(2);
    mockGetInbox.mockResolvedValue(inboxJob());

    const result = await getJobInboxForUser(USER_ID, "job1");
    expect(result.ok).toBe(true);
    expect(mockMarkViewed).toHaveBeenCalledWith("job1", "rec_1");
    expect(mockGetInbox).toHaveBeenCalledWith("job1", "rec_1");
    // Ordering matters: the recruiter must see what the freelancer will see.
    expect(mockMarkViewed.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetInbox.mock.invocationCallOrder[0],
    );
  });

  it("reports not-found for a job the recruiter does not own", async () => {
    mockRecruiter.mockResolvedValue(recruiter());
    mockPlan.mockResolvedValue("FREE");
    mockMarkViewed.mockResolvedValue(0);
    mockGetInbox.mockResolvedValue(null);
    expect(await getJobInboxForUser(USER_ID, "job1")).toEqual({ ok: false, reason: "not-found" });
  });

  it("reports the notes entitlement from the plan", async () => {
    mockRecruiter.mockResolvedValue(recruiter());
    mockMarkViewed.mockResolvedValue(0);
    mockGetInbox.mockResolvedValue(inboxJob());

    mockPlan.mockResolvedValue("FREE");
    const free = await getJobInboxForUser(USER_ID, "job1");
    expect(free.ok && free.canUseNotes).toBe(false);

    mockPlan.mockResolvedValue("RECRUITER_TEAM");
    const team = await getJobInboxForUser(USER_ID, "job1");
    expect(team.ok && team.canUseNotes).toBe(true);
  });
});
