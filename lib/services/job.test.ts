import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JobPostInput } from "@/lib/validations/job";

const { FakeKnownRequestError } = vi.hoisted(() => {
  class FakeKnownRequestError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly meta?: { target?: string[] | string },
    ) {
      super(message);
    }
  }
  return { FakeKnownRequestError };
});
vi.mock("@/lib/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
}));

vi.mock("@/lib/db/job", () => ({
  createDraftJob: vi.fn(),
  updateDraftJob: vi.fn(),
  publishJobTx: vi.fn(),
  closeJobForRecruiter: vi.fn(),
  findJobSlugsLike: vi.fn(),
  getEditableJobForRecruiter: vi.fn(),
  withdrawHeldJobForRecruiter: vi.fn(),
}));
vi.mock("@/lib/db/recruiter", () => ({ getRecruiterPlan: vi.fn() }));
vi.mock("@/lib/db/taxonomy", () => ({
  getCategoryIdBySlug: vi.fn(),
  findSkillsBySlugs: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getRecruiterProfileByUserId: vi.fn() }));

import {
  closeJobForRecruiter,
  createDraftJob,
  findJobSlugsLike,
  getEditableJobForRecruiter,
  publishJobTx,
  updateDraftJob,
  withdrawHeldJobForRecruiter,
} from "@/lib/db/job";
import { getRecruiterPlan } from "@/lib/db/recruiter";
import { findSkillsBySlugs, getCategoryIdBySlug } from "@/lib/db/taxonomy";
import { getRecruiterProfileByUserId } from "@/lib/db/users";
import { scanTextForSafetyFlags } from "@/lib/services/safety";

import {
  closeJobForUser,
  createJobDraftForUser,
  publishJobForUser,
  updateJobDraftForUser,
  withdrawJobForUser,
} from "./job";

const mockProfile = vi.mocked(getRecruiterProfileByUserId);
const mockEditable = vi.mocked(getEditableJobForRecruiter);
const mockUpdate = vi.mocked(updateDraftJob);
const mockWithdraw = vi.mocked(withdrawHeldJobForRecruiter);
const mockCategory = vi.mocked(getCategoryIdBySlug);
const mockSkills = vi.mocked(findSkillsBySlugs);
const mockSlugsLike = vi.mocked(findJobSlugsLike);
const mockCreate = vi.mocked(createDraftJob);
const mockPublishTx = vi.mocked(publishJobTx);
const mockPlan = vi.mocked(getRecruiterPlan);
const mockClose = vi.mocked(closeJobForRecruiter);

const USER_ID = "00000000-0000-4000-8000-000000000003";
const RECRUITER_ID = "rec_1";

const profile = (over: Record<string, unknown> = {}) =>
  ({ id: RECRUITER_ID, isBanned: false, ...over }) as Awaited<
    ReturnType<typeof getRecruiterProfileByUserId>
  >;

const input = (over: Partial<JobPostInput> = {}): JobPostInput => ({
  title: "Senior Next.js developer for portal rebuild",
  description: "d".repeat(150),
  categorySlug: "full-stack-web-development",
  engagementType: "FULL_TIME",
  budgetMinUsd: 4000,
  budgetMaxUsd: 6500,
  isRemote: true,
  location: null,
  skillSlugs: ["nextjs", "typescript"],
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("createJobDraftForUser", () => {
  it("refuses a caller with no recruiter profile", async () => {
    mockProfile.mockResolvedValue(null);
    expect(await createJobDraftForUser(USER_ID, input())).toEqual({
      ok: false,
      reason: "no-recruiter-profile",
    });
  });

  it("refuses a banned recruiter", async () => {
    mockProfile.mockResolvedValue(profile({ isBanned: true }));
    expect(await createJobDraftForUser(USER_ID, input())).toEqual({ ok: false, reason: "banned" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses an unknown category", async () => {
    mockProfile.mockResolvedValue(profile());
    mockCategory.mockResolvedValue(null);
    expect(await createJobDraftForUser(USER_ID, input())).toEqual({
      ok: false,
      reason: "invalid-category",
    });
  });

  it("refuses when no submitted skill is real", async () => {
    mockProfile.mockResolvedValue(profile());
    mockCategory.mockResolvedValue("cat_1");
    mockSkills.mockResolvedValue([]);
    expect(await createJobDraftForUser(USER_ID, input())).toEqual({
      ok: false,
      reason: "no-valid-skills",
    });
  });

  it("creates the draft with scrubbed skill ids and a slug from the title", async () => {
    mockProfile.mockResolvedValue(profile());
    mockCategory.mockResolvedValue("cat_1");
    mockSkills.mockResolvedValue([{ id: "sk_1", slug: "nextjs" }]); // typescript scrubbed
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockResolvedValue({ id: "job_1", slug: "senior-next-js-developer-for-portal-rebuild" });

    const result = await createJobDraftForUser(USER_ID, input());
    expect(result.ok).toBe(true);
    const args = mockCreate.mock.calls[0][0];
    expect(args.recruiterId).toBe(RECRUITER_ID);
    expect(args.skillIds).toEqual(["sk_1"]);
    expect(args.slug).toBe("senior-next-js-developer-for-portal-rebuild");
  });

  it("retries a slug race and succeeds", async () => {
    mockProfile.mockResolvedValue(profile());
    mockCategory.mockResolvedValue("cat_1");
    mockSkills.mockResolvedValue([{ id: "sk_1", slug: "nextjs" }]);
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate
      .mockRejectedValueOnce(new FakeKnownRequestError("dup", "P2002", { target: ["slug"] }))
      .mockResolvedValue({ id: "job_1", slug: "x" });

    const result = await createJobDraftForUser(USER_ID, input());
    expect(result.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe("publishJobForUser", () => {
  it("passes the plan's cap and the real scanner into the transaction", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("RECRUITER_GROWTH");
    mockPublishTx.mockResolvedValue({ ok: true, status: "ACTIVE" });

    const result = await publishJobForUser(USER_ID, "job_1");
    expect(result).toEqual({ ok: true, status: "ACTIVE" });

    const args = mockPublishTx.mock.calls[0][0];
    expect(args.cap).toBe(5);
    expect(args.scan).toBe(scanTextForSafetyFlags);
  });

  it("passes unlimited (null) for the Team plan", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("RECRUITER_TEAM");
    mockPublishTx.mockResolvedValue({ ok: true, status: "ACTIVE" });
    await publishJobForUser(USER_ID, "job_1");
    expect(mockPublishTx.mock.calls[0][0].cap).toBeNull();
  });

  it("maps a cap hit to the typed error with cap, used, and plan", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("FREE");
    mockPublishTx.mockResolvedValue({ ok: false, reason: "cap-reached", used: 1 });

    expect(await publishJobForUser(USER_ID, "job_1")).toEqual({
      ok: false,
      reason: "cap-reached",
      cap: 1,
      used: 1,
      plan: "FREE",
    });
  });

  it("surfaces a flagged publish as PENDING_REVIEW", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("FREE");
    mockPublishTx.mockResolvedValue({ ok: true, status: "PENDING_REVIEW" });
    expect(await publishJobForUser(USER_ID, "job_1")).toEqual({
      ok: true,
      status: "PENDING_REVIEW",
    });
  });

  it("refuses a banned recruiter before touching the transaction", async () => {
    mockProfile.mockResolvedValue(profile({ isBanned: true }));
    expect(await publishJobForUser(USER_ID, "job_1")).toEqual({ ok: false, reason: "banned" });
    expect(mockPublishTx).not.toHaveBeenCalled();
  });
});

describe("publishJobForUser — transaction aborts", () => {
  it("maps a lock-wait timeout (P2028) to a retryable conflict, not a throw", async () => {
    mockProfile.mockResolvedValue(profile());
    mockPlan.mockResolvedValue("FREE");
    mockPublishTx.mockRejectedValue(new FakeKnownRequestError("timeout", "P2028"));
    expect(await publishJobForUser(USER_ID, "job_1")).toEqual({ ok: false, reason: "conflict" });
  });
});

describe("updateJobDraftForUser — slug follows the title", () => {
  const editable = (slug: string) =>
    ({ id: "job_1", slug }) as unknown as Awaited<ReturnType<typeof getEditableJobForRecruiter>>;

  beforeEach(() => {
    mockProfile.mockResolvedValue(profile());
    mockCategory.mockResolvedValue("cat_1");
    mockSkills.mockResolvedValue([{ id: "sk_1", slug: "nextjs" }]);
    mockUpdate.mockResolvedValue(true);
  });

  it("keeps a slug already in the new title's numbered family", async () => {
    mockEditable.mockResolvedValue(editable("senior-next-js-developer-for-portal-rebuild-2"));
    const result = await updateJobDraftForUser(USER_ID, "job_1", input());
    expect(result).toEqual({ ok: true });
    expect(mockUpdate.mock.calls[0][0].slug).toBeUndefined();
    expect(mockSlugsLike).not.toHaveBeenCalled();
  });

  it("re-derives the slug when the title changed", async () => {
    mockEditable.mockResolvedValue(editable("old-title-from-before"));
    mockSlugsLike.mockResolvedValue(new Set());
    const result = await updateJobDraftForUser(USER_ID, "job_1", input());
    expect(result).toEqual({ ok: true });
    expect(mockUpdate.mock.calls[0][0].slug).toBe("senior-next-js-developer-for-portal-rebuild");
  });

  it("reports not-found when the draft does not exist or is not editable", async () => {
    mockEditable.mockResolvedValue(null);
    expect(await updateJobDraftForUser(USER_ID, "job_1", input())).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("withdrawJobForUser", () => {
  it("withdraws an owned held job back to draft", async () => {
    mockProfile.mockResolvedValue(profile());
    mockWithdraw.mockResolvedValue(true);
    expect(await withdrawJobForUser(USER_ID, "job_1")).toEqual({ ok: true });
    expect(mockWithdraw).toHaveBeenCalledWith("job_1", RECRUITER_ID);
  });

  it("reports not-found for a job that is not held or not owned", async () => {
    mockProfile.mockResolvedValue(profile());
    mockWithdraw.mockResolvedValue(false);
    expect(await withdrawJobForUser(USER_ID, "job_1")).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses a banned recruiter", async () => {
    mockProfile.mockResolvedValue(profile({ isBanned: true }));
    expect(await withdrawJobForUser(USER_ID, "job_1")).toEqual({ ok: false, reason: "banned" });
    expect(mockWithdraw).not.toHaveBeenCalled();
  });
});

describe("closeJobForUser", () => {
  it("closes an owned active job", async () => {
    mockProfile.mockResolvedValue(profile());
    mockClose.mockResolvedValue(true);
    expect(await closeJobForUser(USER_ID, "job_1")).toEqual({ ok: true });
    expect(mockClose).toHaveBeenCalledWith("job_1", RECRUITER_ID);
  });

  it("reports not-found for a job it does not own or that is not active", async () => {
    mockProfile.mockResolvedValue(profile());
    mockClose.mockResolvedValue(false);
    expect(await closeJobForUser(USER_ID, "job_1")).toEqual({ ok: false, reason: "not-found" });
  });
});
