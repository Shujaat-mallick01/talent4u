import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/profile-edit", () => ({
  getFreelancerProfileForEdit: vi.fn(),
  getRecruiterProfileForEdit: vi.fn(),
  updateFreelancerProfileWithSkills: vi.fn(),
  updateRecruiterProfile: vi.fn(),
}));
vi.mock("@/lib/db/freelancer", () => ({ findExistingSkillSlugs: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ getUserAuthState: vi.fn() }));
// Storage is I/O; these suites test the decisions, not the upload.
vi.mock("@/lib/storage/profile-images", () => ({
  uploadCompanyLogoUpdate: vi.fn(),
  uploadFreelancerAvatar: vi.fn(),
  validateProfileImage: vi.fn(),
}));

import { findExistingSkillSlugs } from "@/lib/db/freelancer";
import {
  getFreelancerProfileForEdit,
  getRecruiterProfileForEdit,
  updateFreelancerProfileWithSkills,
  updateRecruiterProfile,
} from "@/lib/db/profile-edit";
import { getUserAuthState } from "@/lib/db/users";
import {
  companyProfileEditSchema,
  freelancerProfileEditSchema,
} from "@/lib/validations/profile-edit";

import {
  canEditVerificationEvidence,
  updateCompanyProfileForUser,
  updateFreelancerProfileForUser,
} from "./profile-edit";

const mockAuth = vi.mocked(getUserAuthState);
const mockFreelancer = vi.mocked(getFreelancerProfileForEdit);
const mockRecruiter = vi.mocked(getRecruiterProfileForEdit);
const mockWriteFreelancer = vi.mocked(updateFreelancerProfileWithSkills);
const mockWriteRecruiter = vi.mocked(updateRecruiterProfile);
const mockSkills = vi.mocked(findExistingSkillSlugs);

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";

const account = (over: Record<string, unknown> = {}) =>
  ({ id: USER_ID, email: "jane@example.com", role: "FREELANCER", hasProfile: true, ...over }) as Awaited<
    ReturnType<typeof getUserAuthState>
  >;

const freelancerProfile = (over: Record<string, unknown> = {}) =>
  ({
    id: "fl_1",
    slug: "jane-cooper",
    displayName: "Jane Cooper",
    headline: "Senior Shopify developer for high-volume stores",
    bio: "b".repeat(200),
    country: "PK",
    timezone: "Asia/Karachi",
    hourlyRateUsd: 45,
    isOpenToWork: true,
    githubUrl: null,
    portfolioUrl: null,
    linkedinUrl: null,
    verification: "NONE",
    verificationSubmittedAt: null,
    verificationNote: null,
    deactivatedAt: null,
    skills: [{ yearsExp: 4, skill: { slug: "shopify", name: "Shopify" } }],
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getFreelancerProfileForEdit>>;

const recruiterProfile = (over: Record<string, unknown> = {}) =>
  ({
    id: "rec_1",
    slug: "acme",
    companyName: "Acme",
    websiteUrl: "https://acme.com",
    description: null,
    country: "DE",
    logoUrl: null,
    companyDomain: "acme.com",
    registrationNo: "09876543",
    linkedinUrl: "https://linkedin.com/company/acme",
    tier: "VERIFIED",
    isBanned: false,
    deactivatedAt: null,
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getRecruiterProfileForEdit>>;

const freelancerInput = (over: Record<string, unknown> = {}) =>
  ({
    displayName: "Jane Cooper",
    headline: "Senior Shopify developer for high-volume stores",
    bio: "b".repeat(200),
    country: "PK",
    timezone: "Asia/Karachi",
    hourlyRateUsd: 60,
    isOpenToWork: true,
    skills: [{ slug: "shopify", yearsExp: 5 }],
    githubUrl: null,
    portfolioUrl: null,
    linkedinUrl: null,
    ...over,
  }) as Parameters<typeof updateFreelancerProfileForUser>[1];

const companyInput = (over: Record<string, unknown> = {}) =>
  ({
    companyName: "Acme Industries",
    websiteUrl: "https://acme.com",
    description: null,
    country: "DE",
    ...over,
  }) as Parameters<typeof updateCompanyProfileForUser>[1];

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(account());
  mockFreelancer.mockResolvedValue(freelancerProfile());
  mockRecruiter.mockResolvedValue(recruiterProfile());
  mockSkills.mockResolvedValue(new Set(["shopify", "react"]));
  mockWriteFreelancer.mockResolvedValue(undefined);
  mockWriteRecruiter.mockResolvedValue(undefined);
});

describe("updateFreelancerProfileForUser", () => {
  it("edits only the caller's own profile — the id comes from the userId lookup", async () => {
    const result = await updateFreelancerProfileForUser(USER_ID, freelancerInput());

    expect(result).toEqual({
      ok: true,
      slug: "jane-cooper",
      verificationWithdrawn: false,
      approvalCleared: false,
    });
    // Looked up by who is asking, not by anything the caller could send.
    expect(mockFreelancer).toHaveBeenCalledWith(USER_ID);
    expect(mockWriteFreelancer).toHaveBeenCalledWith(
      expect.objectContaining({ freelancerId: "fl_1" }),
    );
  });

  it("refuses a caller who is not a freelancer, and writes nothing", async () => {
    mockAuth.mockResolvedValue(account({ id: OTHER_USER_ID, role: "RECRUITER" }));

    const result = await updateFreelancerProfileForUser(OTHER_USER_ID, freelancerInput());

    expect(result).toEqual({ ok: false, reason: "wrong-role" });
    expect(mockWriteFreelancer).not.toHaveBeenCalled();
  });

  it("refuses when the account has no freelancer profile yet", async () => {
    mockFreelancer.mockResolvedValue(null);

    const result = await updateFreelancerProfileForUser(USER_ID, freelancerInput());

    expect(result).toEqual({ ok: false, reason: "no-profile" });
    expect(mockWriteFreelancer).not.toHaveBeenCalled();
  });

  it("withdraws a pending verification submission when a work link changes", async () => {
    // The links ARE the evidence a reviewer judges. Changing them mid-review
    // must pull the submission out of the queue — same rule the recruiter
    // evidence fields follow.
    mockFreelancer.mockResolvedValue(
      freelancerProfile({
        githubUrl: "https://github.com/old",
        verificationSubmittedAt: new Date("2026-08-20T10:00:00Z"),
      }),
    );

    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ githubUrl: "https://github.com/new" }),
    );

    expect(result).toMatchObject({ ok: true, verificationWithdrawn: true });
    expect(mockWriteFreelancer).toHaveBeenCalledWith(
      expect.objectContaining({ withdrawVerificationSubmission: true }),
    );
  });

  it("leaves a pending submission alone when only unrelated fields change", async () => {
    mockFreelancer.mockResolvedValue(
      freelancerProfile({
        githubUrl: "https://github.com/same",
        verificationSubmittedAt: new Date("2026-08-20T10:00:00Z"),
      }),
    );

    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ githubUrl: "https://github.com/same", headline: "A different headline entirely" }),
    );

    expect(result).toMatchObject({ ok: true, verificationWithdrawn: false });
    expect(mockWriteFreelancer).toHaveBeenCalledWith(
      expect.objectContaining({ withdrawVerificationSubmission: false }),
    );
  });

  it("clears a recorded approval when the links it certified change", async () => {
    // An approval is of specific links. Replacing them after the review must
    // return the profile to un-reviewed, or the record certifies pages no
    // reviewer ever opened — and would later be the basis for a badge.
    mockFreelancer.mockResolvedValue(
      freelancerProfile({
        githubUrl: "https://github.com/reviewed",
        verificationNote: "approved:work-links-approved",
      }),
    );

    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ githubUrl: "https://github.com/swapped" }),
    );

    expect(result).toMatchObject({ ok: true, approvalCleared: true });
    expect(mockWriteFreelancer).toHaveBeenCalledWith(
      expect.objectContaining({ clearWorkApproval: true }),
    );
  });

  it("leaves an approval alone when unrelated fields change", async () => {
    mockFreelancer.mockResolvedValue(
      freelancerProfile({
        githubUrl: "https://github.com/reviewed",
        verificationNote: "approved:work-links-approved",
      }),
    );

    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ githubUrl: "https://github.com/reviewed", hourlyRateUsd: 90 }),
    );

    expect(result).toMatchObject({ ok: true, approvalCleared: false });
  });

  it("does not withdraw when links change with no submission pending", async () => {
    mockFreelancer.mockResolvedValue(freelancerProfile({ githubUrl: "https://github.com/old" }));

    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ githubUrl: "https://github.com/new" }),
    );

    expect(result).toMatchObject({ ok: true, verificationWithdrawn: false });
  });

  it("never writes the slug — a rename keeps the public URL", async () => {
    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ displayName: "Jane C. Cooper" }),
    );

    expect(result).toEqual({
      ok: true,
      slug: "jane-cooper",
      verificationWithdrawn: false,
      approvalCleared: false,
    });
    const { data } = mockWriteFreelancer.mock.calls[0][0];
    expect(data).not.toHaveProperty("slug");
    expect(data.displayName).toBe("Jane C. Cooper");
  });

  it("drops skill slugs that are not real skills", async () => {
    mockSkills.mockResolvedValue(new Set(["react"]));

    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({
        skills: [
          { slug: "react", yearsExp: 6 },
          { slug: "not-a-skill", yearsExp: 30 },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    expect(mockWriteFreelancer.mock.calls[0][0].skillSlugs).toEqual([
      { slug: "react", yearsExp: 6 },
    ]);
  });

  it("refuses a save whose skills are all unknown, rather than emptying the set", async () => {
    mockSkills.mockResolvedValue(new Set());

    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ skills: [{ slug: "not-a-skill", yearsExp: null }] }),
    );

    expect(result).toEqual({ ok: false, reason: "no-valid-skills" });
    expect(mockWriteFreelancer).not.toHaveBeenCalled();
  });

  it("submits the whole skill set, so a removed skill is simply absent", async () => {
    mockSkills.mockResolvedValue(new Set(["react", "shopify"]));

    // The profile currently has shopify; the submission has react only.
    await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ skills: [{ slug: "react", yearsExp: null }] }),
    );

    expect(mockWriteFreelancer.mock.calls[0][0].skillSlugs).toEqual([
      { slug: "react", yearsExp: null },
    ]);
  });

  it("lets a deactivated profile be edited — people fix a page before putting it back up", async () => {
    mockFreelancer.mockResolvedValue(
      freelancerProfile({ deactivatedAt: new Date("2026-08-01T00:00:00.000Z") }),
    );

    const result = await updateFreelancerProfileForUser(USER_ID, freelancerInput());

    expect(result).toEqual({
      ok: true,
      slug: "jane-cooper",
      verificationWithdrawn: false,
      approvalCleared: false,
    });
    expect(mockWriteFreelancer).toHaveBeenCalledTimes(1);
  });

  it("saves a raised rate", async () => {
    await updateFreelancerProfileForUser(USER_ID, freelancerInput({ hourlyRateUsd: 120 }));

    expect(mockWriteFreelancer.mock.calls[0][0].data.hourlyRateUsd).toBe(120);
  });
});

describe("updateCompanyProfileForUser", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(account({ role: "RECRUITER" }));
  });

  it("edits only the caller's own company", async () => {
    const result = await updateCompanyProfileForUser(USER_ID, companyInput());

    expect(result).toEqual({ ok: true, slug: "acme" });
    expect(mockRecruiter).toHaveBeenCalledWith(USER_ID);
    expect(mockWriteRecruiter).toHaveBeenCalledWith("rec_1", expect.anything());
  });

  it("refuses a caller who is not a recruiter, and writes nothing", async () => {
    mockAuth.mockResolvedValue(account({ role: "FREELANCER" }));

    const result = await updateCompanyProfileForUser(USER_ID, companyInput());

    expect(result).toEqual({ ok: false, reason: "wrong-role" });
    expect(mockWriteRecruiter).not.toHaveBeenCalled();
  });

  it("refuses a banned recruiter — a removed employer cannot rewrite their record", async () => {
    mockRecruiter.mockResolvedValue(recruiterProfile({ isBanned: true }));

    const result = await updateCompanyProfileForUser(USER_ID, companyInput());

    expect(result).toEqual({ ok: false, reason: "banned" });
    expect(mockWriteRecruiter).not.toHaveBeenCalled();
  });

  it("refuses when the account has no company profile yet", async () => {
    mockRecruiter.mockResolvedValue(null);

    const result = await updateCompanyProfileForUser(USER_ID, companyInput());

    expect(result).toEqual({ ok: false, reason: "no-profile" });
    expect(mockWriteRecruiter).not.toHaveBeenCalled();
  });

  it("lets a deactivated company be edited", async () => {
    mockRecruiter.mockResolvedValue(
      recruiterProfile({ deactivatedAt: new Date("2026-08-01T00:00:00.000Z") }),
    );

    const result = await updateCompanyProfileForUser(USER_ID, companyInput());

    expect(result).toEqual({ ok: true, slug: "acme" });
  });

  it("writes no verification evidence, even when the caller smuggles it in", async () => {
    // What a hand-rolled POST would look like if it tried to swap the evidence
    // an approved badge was granted on.
    await updateCompanyProfileForUser(
      USER_ID,
      companyInput({
        companyDomain: "somewhere-else.com",
        registrationNo: "11111111",
        linkedinUrl: "https://linkedin.com/company/somewhere-else",
      }),
    );

    const [, data] = mockWriteRecruiter.mock.calls[0];
    expect(data).not.toHaveProperty("companyDomain");
    expect(data).not.toHaveProperty("registrationNo");
    expect(data).not.toHaveProperty("linkedinUrl");
    expect(Object.keys(data).sort()).toEqual([
      "companyName",
      "country",
      "description",
      "websiteUrl",
    ]);
  });

  it("never writes the slug — a company rename keeps its public URL", async () => {
    const result = await updateCompanyProfileForUser(
      USER_ID,
      companyInput({ companyName: "Acme Global" }),
    );

    expect(result).toEqual({ ok: true, slug: "acme" });
    expect(mockWriteRecruiter.mock.calls[0][1]).not.toHaveProperty("slug");
  });
});

describe("canEditVerificationEvidence", () => {
  it("is open while unverified — the evidence has not been approved yet", () => {
    expect(canEditVerificationEvidence("UNVERIFIED")).toBe(true);
  });

  it("is frozen once a badge has been granted", () => {
    expect(canEditVerificationEvidence("VERIFIED")).toBe(false);
    expect(canEditVerificationEvidence("TRUSTED")).toBe(false);
  });
});

describe("edit schemas", () => {
  it("strips the verification evidence out of a company submission", () => {
    const parsed = companyProfileEditSchema.parse({
      companyName: "Acme",
      websiteUrl: "https://acme.com",
      description: "",
      country: "DE",
      companyDomain: "somewhere-else.com",
      registrationNo: "11111111",
      linkedinUrl: "https://linkedin.com/company/somewhere-else",
    });

    expect(Object.keys(parsed).sort()).toEqual([
      "companyName",
      "country",
      "description",
      "websiteUrl",
    ]);
  });

  it("keeps the onboarding rules it was picked from", () => {
    const tooShort = freelancerProfileEditSchema.safeParse({
      displayName: "J",
      headline: "short",
      bio: "too short",
      country: "PK",
      timezone: "Asia/Karachi",
      hourlyRateUsd: null,
      isOpenToWork: true,
      skills: [],
      githubUrl: "",
      portfolioUrl: "",
      linkedinUrl: "",
    });

    expect(tooShort.success).toBe(false);
    const fields = new Set(tooShort.error?.issues.map((i) => String(i.path[0])));
    expect(fields).toContain("displayName");
    expect(fields).toContain("headline");
    expect(fields).toContain("bio");
    expect(fields).toContain("skills");
  });

  it("refuses a slug field — the public URL is not editable input", () => {
    const parsed = freelancerProfileEditSchema.parse({
      displayName: "Jane Cooper",
      headline: "Senior Shopify developer for high-volume stores",
      bio: "b".repeat(200),
      country: "PK",
      timezone: "Asia/Karachi",
      hourlyRateUsd: 45,
      isOpenToWork: true,
      skills: [{ slug: "shopify", yearsExp: 4 }],
      githubUrl: "",
      portfolioUrl: "",
      linkedinUrl: "",
      slug: "somebody-elses-url",
    });

    expect(parsed).not.toHaveProperty("slug");
  });
});

describe("profile prose is scanned before it is published", () => {
  // The hole this closes: publish a clean job, then move the scam into the
  // profile prose beside it, which used to go live with no flag at all.
  it("refuses a company description that trips the scanner, and writes nothing", async () => {
    mockAuth.mockResolvedValue(account({ role: "RECRUITER" }));

    const result = await updateCompanyProfileForUser(
      USER_ID,
      companyInput({ description: "Applicants must pay a $200 registration fee before we begin." }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "flagged",
      flag: { field: "description", match: { reason: "UPFRONT_PAYMENT" } },
    });
    expect(mockWriteRecruiter).not.toHaveBeenCalled();
  });

  it("refuses a company NAME that trips the scanner too", async () => {
    mockAuth.mockResolvedValue(account({ role: "RECRUITER" }));

    const result = await updateCompanyProfileForUser(
      USER_ID,
      companyInput({ companyName: "Training Fee Recruitment" }),
    );

    expect(result).toMatchObject({ ok: false, reason: "flagged", flag: { field: "companyName" } });
    expect(mockWriteRecruiter).not.toHaveBeenCalled();
  });

  it("refuses a flagged freelancer bio, and writes nothing", async () => {
    const result = await updateFreelancerProfileForUser(
      USER_ID,
      freelancerInput({ bio: "Applicants must pay a $200 registration fee before we begin." }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "flagged",
      flag: { field: "bio", match: { reason: "UPFRONT_PAYMENT" } },
    });
    expect(mockWriteFreelancer).not.toHaveBeenCalled();
  });

  it("refuses BEFORE the banned check has anything to say, but after it", async () => {
    // Ordering matters: a banned recruiter is refused as banned, not as
    // flagged, so the removed-employer message is the one they see.
    mockAuth.mockResolvedValue(account({ role: "RECRUITER" }));
    mockRecruiter.mockResolvedValue(recruiterProfile({ isBanned: true }));

    const result = await updateCompanyProfileForUser(
      USER_ID,
      companyInput({ description: "Applicants must pay a $200 registration fee before we begin." }),
    );

    expect(result).toEqual({ ok: false, reason: "banned" });
  });

  it("leaves ordinary prose alone", async () => {
    mockAuth.mockResolvedValue(account({ role: "RECRUITER" }));

    const result = await updateCompanyProfileForUser(
      USER_ID,
      companyInput({ description: "We build high-volume Shopify storefronts for UK retailers." }),
    );

    expect(result).toMatchObject({ ok: true });
    expect(mockWriteRecruiter).toHaveBeenCalled();
  });
});
