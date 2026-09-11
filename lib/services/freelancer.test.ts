import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FreelancerOnboardingInput } from "@/lib/validations/freelancer";

// A minimal stand-in for the generated Prisma namespace so the conflict path
// is testable without loading the real client/engine. Defined via vi.hoisted
// because vi.mock is lifted above ordinary declarations.
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
vi.mock("@/lib/db/freelancer", () => ({
  findExistingSkillSlugs: vi.fn(),
  findFreelancerSlugsLike: vi.fn(),
  createFreelancerProfileWithSkills: vi.fn(),
}));

import {
  createFreelancerProfileWithSkills,
  findExistingSkillSlugs,
  findFreelancerSlugsLike,
} from "@/lib/db/freelancer";
import { getUserAuthState } from "@/lib/db/users";

import {
  onboardFreelancer,
  pickAvailableSlug,
  slugify,
} from "./freelancer";

const mockAuthState = vi.mocked(getUserAuthState);
const mockExistingSkills = vi.mocked(findExistingSkillSlugs);
const mockSlugsLike = vi.mocked(findFreelancerSlugsLike);
const mockCreate = vi.mocked(createFreelancerProfileWithSkills);

const USER_ID = "00000000-0000-4000-8000-000000000001";

const input = (over: Partial<FreelancerOnboardingInput> = {}): FreelancerOnboardingInput => ({
  displayName: "Jane Cooper",
  headline: "Senior Shopify developer for high-volume stores",
  bio: "x".repeat(150),
  country: "PK",
  timezone: "Asia/Karachi",
  hourlyRateUsd: 45,
  isOpenToWork: true,
  skills: [
    { slug: "shopify", yearsExp: 6 },
    { slug: "typescript", yearsExp: 8 },
  ],
  githubUrl: null,
  portfolioUrl: null,
  linkedinUrl: null,
  ...over,
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Jane Cooper")).toBe("jane-cooper");
  });
  it("strips diacritics", () => {
    expect(slugify("Marta Zielińska")).toBe("marta-zielinska");
  });
  it("collapses punctuation and trims dashes", () => {
    expect(slugify("  --Hello, World!!  ")).toBe("hello-world");
  });
  it("falls back when nothing usable remains", () => {
    expect(slugify("···")).toBe("freelancer");
    expect(slugify("")).toBe("freelancer");
  });
  it("caps length without a trailing dash", () => {
    const s = slugify("a".repeat(80));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("pickAvailableSlug", () => {
  it("returns the base when free", () => {
    expect(pickAvailableSlug("jane-cooper", new Set())).toBe("jane-cooper");
  });
  it("appends -2 when the base is taken", () => {
    expect(pickAvailableSlug("jane-cooper", new Set(["jane-cooper"]))).toBe("jane-cooper-2");
  });
  it("finds the first free numbered variant", () => {
    expect(
      pickAvailableSlug("jane-cooper", new Set(["jane-cooper", "jane-cooper-2", "jane-cooper-3"])),
    ).toBe("jane-cooper-4");
  });
});

describe("onboardFreelancer", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects a caller with no account", async () => {
    mockAuthState.mockResolvedValue(null);
    expect(await onboardFreelancer(USER_ID, input())).toEqual({ ok: false, reason: "wrong-role" });
  });

  it("rejects a non-freelancer", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "RECRUITER", hasProfile: false });
    expect(await onboardFreelancer(USER_ID, input())).toEqual({ ok: false, reason: "wrong-role" });
  });

  it("rejects a freelancer who already has a profile", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: true });
    expect(await onboardFreelancer(USER_ID, input())).toEqual({
      ok: false,
      reason: "already-onboarded",
    });
  });

  it("fails when none of the submitted skills are real", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: false });
    mockExistingSkills.mockResolvedValue(new Set()); // nothing matched
    expect(await onboardFreelancer(USER_ID, input())).toEqual({
      ok: false,
      reason: "no-valid-skills",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the profile, keeping only real skills, and returns the slug", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: false });
    // "typescript" is a phantom skill that must be dropped.
    mockExistingSkills.mockResolvedValue(new Set(["shopify"]));
    mockSlugsLike.mockResolvedValue(new Set(["jane-cooper"])); // base taken -> -2
    mockCreate.mockResolvedValue({ id: "fp_1", slug: "jane-cooper-2" });

    const result = await onboardFreelancer(USER_ID, input());
    expect(result).toEqual({ ok: true, slug: "jane-cooper-2" });

    const args = mockCreate.mock.calls[0][0];
    expect(args.slug).toBe("jane-cooper-2");
    expect(args.skillSlugs).toEqual([{ slug: "shopify", yearsExp: 6 }]);
  });

  it("maps an unspecified unique conflict to a conflict result", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: false });
    mockExistingSkills.mockResolvedValue(new Set(["shopify"]));
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockRejectedValue(new FakeKnownRequestError("dup", "P2002"));

    expect(await onboardFreelancer(USER_ID, input())).toEqual({ ok: false, reason: "conflict" });
    expect(mockCreate).toHaveBeenCalledTimes(1); // no retry on an unknown target
  });

  it("treats a userId unique conflict as already-onboarded (no retry)", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: false });
    mockExistingSkills.mockResolvedValue(new Set(["shopify"]));
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockRejectedValue(new FakeKnownRequestError("dup", "P2002", { target: ["userId"] }));

    expect(await onboardFreelancer(USER_ID, input())).toEqual({ ok: false, reason: "already-onboarded" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries past a slug race and succeeds", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: false });
    mockExistingSkills.mockResolvedValue(new Set(["shopify"]));
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate
      .mockRejectedValueOnce(new FakeKnownRequestError("dup", "P2002", { target: ["slug"] }))
      .mockResolvedValue({ id: "fp_1", slug: "jane-cooper-2" });

    expect(await onboardFreelancer(USER_ID, input())).toEqual({ ok: true, slug: "jane-cooper-2" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("gives up with a conflict after exhausting slug retries", async () => {
    mockAuthState.mockResolvedValue({ id: USER_ID, email: "a@b.c", role: "FREELANCER", hasProfile: false });
    mockExistingSkills.mockResolvedValue(new Set(["shopify"]));
    mockSlugsLike.mockResolvedValue(new Set());
    mockCreate.mockRejectedValue(new FakeKnownRequestError("dup", "P2002", { target: ["slug"] }));

    expect(await onboardFreelancer(USER_ID, input())).toEqual({ ok: false, reason: "conflict" });
    expect(mockCreate).toHaveBeenCalledTimes(5); // SLUG_RETRY_LIMIT
  });
});

describe("onboarding is scanned too — the front door, not just the editor", () => {
  // This file scopes its reset inside an earlier describe, so this block
  // needs its own or it inherits call counts from the slug-conflict tests.
  beforeEach(() => vi.resetAllMocks());

  it("refuses a flagged bio and never creates the profile", async () => {
    mockAuthState.mockResolvedValue({
      id: USER_ID,
      email: "jane@example.com",
      role: "FREELANCER",
      hasProfile: false,
    });

    const result = await onboardFreelancer(USER_ID, input({ bio: "Applicants must pay a $200 registration fee before we begin." }));

    expect(result).toMatchObject({
      ok: false,
      reason: "flagged",
      flag: { field: "bio", match: { reason: "UPFRONT_PAYMENT" } },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses before the skills are even scrubbed — no database work for a scam signup", async () => {
    mockAuthState.mockResolvedValue({
      id: USER_ID,
      email: "jane@example.com",
      role: "FREELANCER",
      hasProfile: false,
    });

    await onboardFreelancer(USER_ID, input({ bio: "Applicants must pay a $200 registration fee before we begin." }));

    expect(mockExistingSkills).not.toHaveBeenCalled();
  });
});
