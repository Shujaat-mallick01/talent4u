import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/freelancer-verification", () => ({
  claimFreelancerVerificationDecision: vi.fn(),
  getFreelancerVerificationById: vi.fn(),
  getFreelancerVerificationStateForUser: vi.fn(),
  markFreelancerVerificationSubmitted: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getUserAuthState: vi.fn() }));
vi.mock("./notify", () => ({ onWorkLinksReviewed: vi.fn() }));

import {
  claimFreelancerVerificationDecision,
  getFreelancerVerificationById,
  getFreelancerVerificationStateForUser,
  markFreelancerVerificationSubmitted,
} from "@/lib/db/freelancer-verification";
import { getUserAuthState } from "@/lib/db/users";
import {
  freelancerVerificationNoteSchema,
  isApprovalMarker,
  WORK_LINKS_APPROVED_NOTE,
} from "@/lib/validations/freelancer-verification";

import {
  approveFreelancerWorkLinks,
  canSubmitWorkVerification,
  freelancerVerificationStage,
  rejectFreelancerWorkLinks,
  submitFreelancerVerification,
  workLinkReadiness,
} from "./freelancer-verification";

const mockAuth = vi.mocked(getUserAuthState);
const mockState = vi.mocked(getFreelancerVerificationStateForUser);
const mockById = vi.mocked(getFreelancerVerificationById);
const mockSubmit = vi.mocked(markFreelancerVerificationSubmitted);
const mockClaim = vi.mocked(claimFreelancerVerificationDecision);

const USER_ID = "00000000-0000-4000-8000-000000000020";
const ADMIN_ID = "00000000-0000-4000-8000-000000000021";
const FREELANCER_ID = "flr1";

const account = (over: Record<string, unknown> = {}) =>
  ({ id: USER_ID, email: "sam@example.com", role: "FREELANCER", hasProfile: true, ...over }) as Awaited<
    ReturnType<typeof getUserAuthState>
  >;

/** A live profile with one proof of work and nothing in flight. */
const state = (over: Record<string, unknown> = {}) =>
  ({
    id: FREELANCER_ID,
    slug: "sam-diaz",
    displayName: "Sam Diaz",
    verification: "NONE",
    githubUrl: "https://github.com/samdiaz",
    portfolioUrl: null,
    linkedinUrl: null,
    verificationSubmittedAt: null,
    verificationNote: null,
    verifiedAt: null,
    deactivatedAt: null,
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getFreelancerVerificationStateForUser>>;

/** The admin-side view of a pending submission. */
const pending = (over: Record<string, unknown> = {}) =>
  ({
    id: FREELANCER_ID,
    slug: "sam-diaz",
    displayName: "Sam Diaz",
    verification: "NONE",
    githubUrl: "https://github.com/samdiaz",
    portfolioUrl: null,
    linkedinUrl: null,
    verificationSubmittedAt: new Date("2026-08-20T10:00:00.000Z"),
    verificationNote: null,
    deactivatedAt: null,
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getFreelancerVerificationById>>;

const noLinks = { githubUrl: null, portfolioUrl: null, linkedinUrl: null };

beforeEach(() => vi.resetAllMocks());

// ── Pure rules ─────────────────────────────────────────────────────────────

describe("workLinkReadiness", () => {
  it("needs at least one proof of work — CLAUDE.md's bar", () => {
    expect(workLinkReadiness(noLinks).ready).toBe(false);
    expect(workLinkReadiness({ ...noLinks, githubUrl: "https://github.com/a" }).ready).toBe(true);
    expect(workLinkReadiness({ ...noLinks, portfolioUrl: "https://sam.dev" }).ready).toBe(true);
    expect(workLinkReadiness({ ...noLinks, linkedinUrl: "https://linkedin.com/in/a" }).ready).toBe(
      true,
    );
  });

  it("does not count whitespace as a link", () => {
    expect(workLinkReadiness({ ...noLinks, githubUrl: "   " })).toMatchObject({
      ready: false,
      count: 0,
    });
  });

  it("counts every link that is set", () => {
    expect(
      workLinkReadiness({
        githubUrl: "https://github.com/a",
        portfolioUrl: "https://sam.dev",
        linkedinUrl: null,
      }).count,
    ).toBe(2);
  });
});

describe("freelancerVerificationStage", () => {
  const base = { verification: "NONE" as const, verificationSubmittedAt: null, verificationNote: null };

  it("is NO_LINKS with nothing linked, and READY with one", () => {
    expect(freelancerVerificationStage({ ...base, ...noLinks })).toBe("NO_LINKS");
    expect(
      freelancerVerificationStage({ ...base, ...noLinks, portfolioUrl: "https://sam.dev" }),
    ).toBe("READY");
  });

  it("is PENDING while a submission sits in the queue", () => {
    expect(
      freelancerVerificationStage({
        ...base,
        ...noLinks,
        githubUrl: "https://github.com/a",
        verificationSubmittedAt: new Date(),
      }),
    ).toBe("PENDING");
  });

  it("reads the approval marker as WORK_REVIEWED and a plain note as RETURNED", () => {
    expect(
      freelancerVerificationStage({
        ...base,
        ...noLinks,
        githubUrl: "https://github.com/a",
        verificationNote: WORK_LINKS_APPROVED_NOTE,
      }),
    ).toBe("WORK_REVIEWED");

    expect(
      freelancerVerificationStage({
        ...base,
        ...noLinks,
        githubUrl: "https://github.com/a",
        verificationNote: "That GitHub account has no public commits.",
      }),
    ).toBe("RETURNED");
  });

  it("lets a real badge level outrank everything else on the row", () => {
    expect(
      freelancerVerificationStage({
        ...base,
        ...noLinks,
        verification: "ID_AND_WORK_VERIFIED",
        verificationNote: "stale",
      }),
    ).toBe("ID_VERIFIED");
  });

  it("offers submission only from READY and RETURNED", () => {
    expect(canSubmitWorkVerification("READY")).toBe(true);
    expect(canSubmitWorkVerification("RETURNED")).toBe(true);
    expect(canSubmitWorkVerification("NO_LINKS")).toBe(false);
    expect(canSubmitWorkVerification("PENDING")).toBe(false);
    expect(canSubmitWorkVerification("WORK_REVIEWED")).toBe(false);
    expect(canSubmitWorkVerification("ID_VERIFIED")).toBe(false);
  });
});

describe("the approval marker", () => {
  it("is recognised by its prefix, whatever the case or padding", () => {
    expect(isApprovalMarker(WORK_LINKS_APPROVED_NOTE)).toBe(true);
    expect(isApprovalMarker("  Approved: work-links-approved ")).toBe(true);
    expect(isApprovalMarker("Your GitHub is empty.")).toBe(false);
    expect(isApprovalMarker(null)).toBe(false);
  });

  it("cannot be forged through the rejection note field", () => {
    // Without this, an admin typing "approved: ..." as a REASON would render
    // on the freelancer's page as an acceptance.
    expect(
      freelancerVerificationNoteSchema.safeParse("approved: but fix the portfolio link").success,
    ).toBe(false);
    expect(freelancerVerificationNoteSchema.safeParse("Your GitHub has no public repos.").success).toBe(
      true,
    );
  });

  it("still requires an actionable length", () => {
    expect(freelancerVerificationNoteSchema.safeParse("nope").success).toBe(false);
    expect(freelancerVerificationNoteSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });
});

// ── Submission ─────────────────────────────────────────────────────────────

describe("submitFreelancerVerification", () => {
  it("refuses anyone who is not a freelancer", async () => {
    mockAuth.mockResolvedValue(account({ role: "RECRUITER" }));
    expect(await submitFreelancerVerification(USER_ID)).toEqual({
      ok: false,
      reason: "no-freelancer-profile",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("refuses with no work links, whatever the page rendered", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ githubUrl: null }));
    expect(await submitFreelancerVerification(USER_ID)).toEqual({
      ok: false,
      reason: "no-work-links",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("refuses a resubmission while one is already pending", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ verificationSubmittedAt: new Date() }));
    expect(await submitFreelancerVerification(USER_ID)).toEqual({
      ok: false,
      reason: "already-pending",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("refuses when the links were already reviewed", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ verificationNote: WORK_LINKS_APPROVED_NOTE }));
    expect(await submitFreelancerVerification(USER_ID)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("refuses an already-verified profile", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ verification: "ID_AND_WORK_VERIFIED" }));
    expect(await submitFreelancerVerification(USER_ID)).toEqual({
      ok: false,
      reason: "already-verified",
    });
  });

  it("refuses a deactivated profile", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ deactivatedAt: new Date() }));
    expect(await submitFreelancerVerification(USER_ID)).toEqual({
      ok: false,
      reason: "deactivated",
    });
  });

  it("queues the submission when one link is linked", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state());
    expect(await submitFreelancerVerification(USER_ID)).toEqual({ ok: true });
    expect(mockSubmit).toHaveBeenCalledWith(FREELANCER_ID);
  });

  it("lets a returned submission be sent again once fixed", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(
      state({
        verificationNote: "That portfolio domain does not resolve.",
        portfolioUrl: "https://sam.dev",
      }),
    );
    expect(await submitFreelancerVerification(USER_ID)).toEqual({ ok: true });
    expect(mockSubmit).toHaveBeenCalledWith(FREELANCER_ID);
  });
});

// ── Admin decisions ────────────────────────────────────────────────────────

describe("approveFreelancerWorkLinks", () => {
  it("refuses a non-admin caller", async () => {
    mockAuth.mockResolvedValue(account());
    expect(await approveFreelancerWorkLinks(USER_ID, FREELANCER_ID)).toEqual({
      ok: false,
      reason: "not-admin",
    });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("records the marker and clears the queue entry", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending());
    mockClaim.mockResolvedValue(true);

    expect(await approveFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID)).toEqual({ ok: true });
    // The claim names the submission the admin actually reviewed, so a
    // withdraw-and-refile between queue load and click is never decided
    // by a review of the old links.
    expect(mockClaim).toHaveBeenCalledWith(
      FREELANCER_ID,
      WORK_LINKS_APPROVED_NOTE,
      expect.any(Date),
    );
  });

  it("never grants a badge level — the note is the ONLY thing written", async () => {
    // The whole point of this sprint's resolution: an approval has confirmed
    // links, not a government ID, so neither ID_VERIFIED nor
    // ID_AND_WORK_VERIFIED may be written. There is no db function here that
    // could; this pins the behaviour so a later edit has to break a test.
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending());
    mockClaim.mockResolvedValue(true);

    await approveFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID);
    expect(mockClaim).toHaveBeenCalledTimes(1);
    const [, note] = mockClaim.mock.calls[0];
    expect(note).toBe(WORK_LINKS_APPROVED_NOTE);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("refuses a profile that never submitted", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending({ verificationSubmittedAt: null }));
    expect(await approveFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID)).toEqual({
      ok: false,
      reason: "not-pending",
    });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("re-checks the links at decision time", async () => {
    // They can be removed in the profile editor after submitting; approval
    // must not rubber-stamp an empty submission.
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending({ githubUrl: null }));
    expect(await approveFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID)).toEqual({
      ok: false,
      reason: "no-work-links",
    });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("refuses a deactivated profile and an unknown id", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending({ deactivatedAt: new Date() }));
    expect(await approveFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID)).toEqual({
      ok: false,
      reason: "deactivated",
    });

    mockById.mockResolvedValue(null);
    expect(await approveFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("reports not-pending when another admin claimed it first", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending());
    mockClaim.mockResolvedValue(false);
    expect(await approveFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID)).toEqual({
      ok: false,
      reason: "not-pending",
    });
  });
});

describe("rejectFreelancerWorkLinks", () => {
  const NOTE = "That GitHub account has no public commits — link a portfolio instead.";

  it("refuses a non-admin caller", async () => {
    mockAuth.mockResolvedValue(account());
    expect(await rejectFreelancerWorkLinks(USER_ID, FREELANCER_ID, NOTE)).toEqual({
      ok: false,
      reason: "not-admin",
    });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("stores the note and clears the queue entry", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending());
    mockClaim.mockResolvedValue(true);

    expect(await rejectFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID, NOTE)).toEqual({ ok: true });
    expect(mockClaim).toHaveBeenCalledWith(FREELANCER_ID, NOTE, expect.any(Date));
  });

  it("refuses a note wearing the reserved approval prefix", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    expect(
      await rejectFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID, "approved: actually, no"),
    ).toEqual({ ok: false, reason: "reserved-note" });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("refuses a profile that is not in the queue", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending({ verificationSubmittedAt: null }));
    expect(await rejectFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID, NOTE)).toEqual({
      ok: false,
      reason: "not-pending",
    });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("does not require links to be present — a rejection is why they are not", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockById.mockResolvedValue(pending({ githubUrl: null }));
    mockClaim.mockResolvedValue(true);
    expect(await rejectFreelancerWorkLinks(ADMIN_ID, FREELANCER_ID, NOTE)).toEqual({ ok: true });
  });
});
