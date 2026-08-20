import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecruiterOnboardingInput } from "@/lib/validations/recruiter";

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

vi.mock("@/lib/db/users", () => ({ getUserAuthState: vi.fn() }));
vi.mock("@/lib/db/recruiter", () => ({
  createRecruiterProfile: vi.fn(),
  findRecruiterSlugsLike: vi.fn(),
}));
vi.mock("@/lib/storage/logos", () => ({ uploadCompanyLogo: vi.fn() }));

import { createRecruiterProfile, findRecruiterSlugsLike } from "@/lib/db/recruiter";
import { getUserAuthState } from "@/lib/db/users";
import { uploadCompanyLogo } from "@/lib/storage/logos";

import { onboardRecruiter } from "./recruiter";

const mockAuthState = vi.mocked(getUserAuthState);
const mockSlugsLike = vi.mocked(findRecruiterSlugsLike);
const mockCreate = vi.mocked(createRecruiterProfile);
const mockUpload = vi.mocked(uploadCompanyLogo);

const USER_ID = "00000000-0000-4000-8000-000000000002";
const logoFile = () => new File([new Uint8Array(64)], "logo.png", { type: "image/png" });

const input = (over: Partial<RecruiterOnboardingInput> = {}): RecruiterOnboardingInput => ({
  companyName: "Acme Commerce Ltd",
  companyDomain: "acme.com",
  registrationNo: "09876543",
  linkedinUrl: "https://linkedin.com/company/acme",
  websiteUrl: "https://acme.com",
  description: "x".repeat(60),
  country: "GB",
  ...over,
});

const recruiter = () =>
  ({ id: USER_ID, email: "hi@acme.com", role: "RECRUITER", hasProfile: false }) as const;

beforeEach(() => vi.resetAllMocks());

describe("onboardRecruiter", () => {
  it("rejects a non-recruiter", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: false });
    expect(await onboardRecruiter(USER_ID, input(), null)).toEqual({ ok: false, reason: "wrong-role" });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a recruiter who already onboarded", async () => {
    mockAuthState.mockResolvedValue({ ...recruiter(), hasProfile: true });
    expect(await onboardRecruiter(USER_ID, input(), logoFile())).toEqual({
      ok: false,
      reason: "already-onboarded",
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("creates the profile without a logo when none is given", async () => {
    mockAuthState.mockResolvedValue(recruiter());
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockResolvedValue({ id: "rp_1", slug: "acme-commerce-ltd" });

    const result = await onboardRecruiter(USER_ID, input(), null);
    expect(result).toEqual({ ok: true, slug: "acme-commerce-ltd" });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockCreate.mock.calls[0][0].logoUrl).toBeNull();
  });

  it("uploads the logo and stores its URL", async () => {
    mockAuthState.mockResolvedValue(recruiter());
    mockUpload.mockResolvedValue({ ok: true, url: "https://cdn.example/logo.png" });
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockResolvedValue({ id: "rp_1", slug: "acme-commerce-ltd" });

    const result = await onboardRecruiter(USER_ID, input(), logoFile());
    expect(result).toEqual({ ok: true, slug: "acme-commerce-ltd" });
    expect(mockCreate.mock.calls[0][0].logoUrl).toBe("https://cdn.example/logo.png");
  });

  it("fails cleanly and does not create a profile when the logo upload fails", async () => {
    mockAuthState.mockResolvedValue(recruiter());
    mockUpload.mockResolvedValue({ ok: false, message: "boom" });

    const result = await onboardRecruiter(USER_ID, input(), logoFile());
    expect(result).toEqual({ ok: false, reason: "logo-failed", message: "boom" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retries past a slug race and succeeds", async () => {
    mockAuthState.mockResolvedValue(recruiter());
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate
      .mockRejectedValueOnce(new FakeKnownRequestError("dup", "P2002", { target: ["slug"] }))
      .mockResolvedValue({ id: "rp_1", slug: "acme-commerce-ltd-2" });

    const result = await onboardRecruiter(USER_ID, input(), null);
    expect(result).toEqual({ ok: true, slug: "acme-commerce-ltd-2" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("treats a userId conflict as already-onboarded", async () => {
    mockAuthState.mockResolvedValue(recruiter());
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockRejectedValue(new FakeKnownRequestError("dup", "P2002", { target: ["userId"] }));

    expect(await onboardRecruiter(USER_ID, input(), null)).toEqual({
      ok: false,
      reason: "already-onboarded",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("gives up with a conflict after exhausting slug retries", async () => {
    mockAuthState.mockResolvedValue(recruiter());
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockRejectedValue(new FakeKnownRequestError("dup", "P2002", { target: ["slug"] }));

    expect(await onboardRecruiter(USER_ID, input(), null)).toEqual({ ok: false, reason: "conflict" });
    expect(mockCreate).toHaveBeenCalledTimes(5);
  });
});
