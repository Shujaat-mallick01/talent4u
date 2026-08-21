import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/verification", () => ({
  countDistinctConfirmedFreelancers: vi.fn(),
  getRecruiterTier: vi.fn(),
  getRecruiterTierAndFlags: vi.fn(),
  getVerificationStateForUser: vi.fn(),
  markVerificationSubmitted: vi.fn(),
  recordVerificationRejection: vi.fn(),
  setRecruiterTier: vi.fn(),
  updateVerificationDetails: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getUserAuthState: vi.fn() }));

import {
  countDistinctConfirmedFreelancers,
  getRecruiterTier,
  getRecruiterTierAndFlags,
  getVerificationStateForUser,
  markVerificationSubmitted,
  recordVerificationRejection,
  setRecruiterTier,
  updateVerificationDetails,
} from "@/lib/db/verification";
import { getUserAuthState } from "@/lib/db/users";

import {
  approveVerification,
  evaluateTrustedPromotion,
  rejectVerification,
  submitVerificationForUser,
  updateVerificationDetailsForUser,
} from "./recruiter-verification";

const mockAuth = vi.mocked(getUserAuthState);
const mockState = vi.mocked(getVerificationStateForUser);
const mockTier = vi.mocked(getRecruiterTier);
const mockDistinct = vi.mocked(countDistinctConfirmedFreelancers);
const mockSetTier = vi.mocked(setRecruiterTier);
const mockMarkSubmitted = vi.mocked(markVerificationSubmitted);
const mockFlags = vi.mocked(getRecruiterTierAndFlags);
const mockReject = vi.mocked(recordVerificationRejection);
const mockUpdateDetails = vi.mocked(updateVerificationDetails);

/** The admin-side view of a pending, complete submission. */
const flags = (over: Record<string, unknown> = {}) =>
  ({
    tier: "UNVERIFIED",
    isBanned: false,
    verificationSubmittedAt: new Date("2026-08-20T10:00:00.000Z"),
    companyDomain: "acme.com",
    registrationNo: "09876543",
    linkedinUrl: "https://linkedin.com/company/acme",
    user: { email: "jane@acme.com", emailVerified: new Date() },
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getRecruiterTierAndFlags>>;

const USER_ID = "00000000-0000-4000-8000-000000000010";
const ADMIN_ID = "00000000-0000-4000-8000-000000000011";
const REC_ID = "rec_1";

const account = (over: Record<string, unknown> = {}) =>
  ({ id: USER_ID, email: "jane@acme.com", role: "RECRUITER", hasProfile: true, ...over }) as Awaited<
    ReturnType<typeof getUserAuthState>
  >;

const state = (over: Record<string, unknown> = {}) =>
  ({
    id: REC_ID,
    companyDomain: "acme.com",
    registrationNo: "09876543",
    linkedinUrl: "https://linkedin.com/company/acme",
    tier: "UNVERIFIED",
    verifiedAt: null,
    verificationSubmittedAt: null,
    verificationNote: null,
    isBanned: false,
    user: { emailVerified: new Date() },
    ...over,
  }) as unknown as Awaited<ReturnType<typeof getVerificationStateForUser>>;

beforeEach(() => vi.resetAllMocks());

describe("submitVerificationForUser", () => {
  it("refuses a non-recruiter", async () => {
    mockAuth.mockResolvedValue(account({ role: "FREELANCER" }));
    expect(await submitVerificationForUser(USER_ID)).toEqual({
      ok: false,
      reason: "no-recruiter-profile",
    });
    expect(mockMarkSubmitted).not.toHaveBeenCalled();
  });

  it("refuses a banned recruiter", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ isBanned: true }));
    expect(await submitVerificationForUser(USER_ID)).toEqual({ ok: false, reason: "banned" });
  });

  it("refuses when already verified or already pending", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ tier: "VERIFIED" }));
    expect(await submitVerificationForUser(USER_ID)).toEqual({
      ok: false,
      reason: "already-verified",
    });

    mockState.mockResolvedValue(state({ verificationSubmittedAt: new Date() }));
    expect(await submitVerificationForUser(USER_ID)).toEqual({
      ok: false,
      reason: "already-pending",
    });
    expect(mockMarkSubmitted).not.toHaveBeenCalled();
  });

  it("re-checks the requirements server-side and names what is missing", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ registrationNo: null }));
    expect(await submitVerificationForUser(USER_ID)).toEqual({
      ok: false,
      reason: "requirements-unmet",
      missing: ["registrationNo"],
    });
    expect(mockMarkSubmitted).not.toHaveBeenCalled();
  });

  it("refuses when the ACCOUNT email does not prove the claimed domain", async () => {
    // Claiming acme.com from a gmail account must not pass, whatever the UI did.
    mockAuth.mockResolvedValue(account({ email: "jane@gmail.com" }));
    mockState.mockResolvedValue(state());
    const result = await submitVerificationForUser(USER_ID);
    expect(result).toEqual({
      ok: false,
      reason: "requirements-unmet",
      missing: ["domainEmail"],
    });
  });

  it("queues the submission when every requirement is met", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state());
    expect(await submitVerificationForUser(USER_ID)).toEqual({ ok: true });
    expect(mockMarkSubmitted).toHaveBeenCalledWith(REC_ID);
    // Submission NEVER promotes on its own — a human decides.
    expect(mockSetTier).not.toHaveBeenCalled();
  });
});

describe("approveVerification", () => {
  it("refuses a non-admin caller", async () => {
    mockAuth.mockResolvedValue(account({ role: "RECRUITER" }));
    expect(await approveVerification(USER_ID, REC_ID)).toEqual({ ok: false, reason: "not-admin" });
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("promotes UNVERIFIED to VERIFIED and clears the queue entry", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockFlags.mockResolvedValue(flags());
    mockTier.mockResolvedValue({ tier: "VERIFIED", isBanned: false });
    mockDistinct.mockResolvedValue(0);

    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({ ok: true });
    const args = mockSetTier.mock.calls[0][0];
    expect(args).toMatchObject({
      recruiterId: REC_ID,
      tier: "VERIFIED",
      verificationSubmittedAt: null,
      verificationNote: null,
    });
    expect(args.verifiedAt).toBeInstanceOf(Date);
  });

  it("promotes straight to TRUSTED when the engagements are already there", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockFlags.mockResolvedValue(flags());
    mockTier.mockResolvedValue({ tier: "VERIFIED", isBanned: false });
    mockDistinct.mockResolvedValue(4);

    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({ ok: true });
    expect(mockSetTier).toHaveBeenCalledTimes(2);
    expect(mockSetTier.mock.calls[1][0]).toMatchObject({ tier: "TRUSTED" });
  });

  it("refuses a recruiter who is not pending", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockFlags.mockResolvedValue(flags({ tier: "VERIFIED" }));
    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({ ok: false, reason: "not-pending" });
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("reports not-found for an unknown recruiter", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockFlags.mockResolvedValue(null);
    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("rejectVerification", () => {
  it("keeps the tier, stores the reason, and clears the queue entry", async () => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
    mockFlags.mockResolvedValue(flags());

    expect(await rejectVerification(ADMIN_ID, REC_ID, "Domain doesn't match the LinkedIn page.")).toEqual(
      { ok: true },
    );
    expect(mockReject).toHaveBeenCalledWith(REC_ID, "Domain doesn't match the LinkedIn page.");
    // The tier does not change, so no job rows are rewritten.
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("refuses a non-admin", async () => {
    mockAuth.mockResolvedValue(account());
    expect(await rejectVerification(USER_ID, REC_ID, "nope")).toEqual({
      ok: false,
      reason: "not-admin",
    });
  });
});

describe("evaluateTrustedPromotion", () => {
  it("never promotes an UNVERIFIED recruiter, however many engagements", async () => {
    mockTier.mockResolvedValue({ tier: "UNVERIFIED", isBanned: false });
    mockDistinct.mockResolvedValue(50);
    expect(await evaluateTrustedPromotion(REC_ID)).toBe(false);
    expect(mockSetTier).not.toHaveBeenCalled();
    // The count is not even reached — tier is the first gate.
    expect(mockDistinct).not.toHaveBeenCalled();
  });

  it("promotes a VERIFIED recruiter at the threshold", async () => {
    mockTier.mockResolvedValue({ tier: "VERIFIED", isBanned: false });
    mockDistinct.mockResolvedValue(3);
    expect(await evaluateTrustedPromotion(REC_ID)).toBe(true);
    expect(mockSetTier).toHaveBeenCalledWith({ recruiterId: REC_ID, tier: "TRUSTED" });
  });

  it("does not promote below the threshold", async () => {
    mockTier.mockResolvedValue({ tier: "VERIFIED", isBanned: false });
    mockDistinct.mockResolvedValue(2);
    expect(await evaluateTrustedPromotion(REC_ID)).toBe(false);
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("is idempotent on an already-TRUSTED recruiter", async () => {
    mockTier.mockResolvedValue({ tier: "TRUSTED", isBanned: false });
    expect(await evaluateTrustedPromotion(REC_ID)).toBe(false);
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("never hands a gold badge to a removed employer", async () => {
    mockTier.mockResolvedValue({ tier: "VERIFIED", isBanned: true });
    mockDistinct.mockResolvedValue(9);
    expect(await evaluateTrustedPromotion(REC_ID)).toBe(false);
    expect(mockSetTier).not.toHaveBeenCalled();
    expect(mockDistinct).not.toHaveBeenCalled();
  });

  it("reports false for an unknown recruiter instead of throwing", async () => {
    mockTier.mockResolvedValue(null);
    expect(await evaluateTrustedPromotion(REC_ID)).toBe(false);
    expect(mockSetTier).not.toHaveBeenCalled();
  });
});

describe("approveVerification — evidence re-check at decision time", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(account({ id: ADMIN_ID, role: "ADMIN" }));
  });

  it("refuses a recruiter who never submitted (a mistyped id cannot mint a badge)", async () => {
    mockFlags.mockResolvedValue(flags({ verificationSubmittedAt: null }));
    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({ ok: false, reason: "not-pending" });
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("refuses a banned recruiter", async () => {
    mockFlags.mockResolvedValue(flags({ isBanned: true }));
    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({ ok: false, reason: "banned" });
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("refuses when the evidence no longer satisfies the requirements", async () => {
    // The recruiter edited their domain to something their account email
    // cannot prove after submitting — approval must not rubber-stamp it.
    mockFlags.mockResolvedValue(flags({ companyDomain: "someone-else.com" }));
    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({
      ok: false,
      reason: "requirements-unmet",
    });
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("refuses when the account email is no longer confirmed", async () => {
    mockFlags.mockResolvedValue(flags({ user: { email: "jane@acme.com", emailVerified: null } }));
    expect(await approveVerification(ADMIN_ID, REC_ID)).toEqual({
      ok: false,
      reason: "requirements-unmet",
    });
  });
});

describe("updateVerificationDetailsForUser", () => {
  const details = {
    companyDomain: "acme.com",
    registrationNo: "09876543",
    linkedinUrl: "https://linkedin.com/company/acme",
  };

  it("refuses a non-recruiter", async () => {
    mockAuth.mockResolvedValue(account({ role: "FREELANCER" }));
    expect(await updateVerificationDetailsForUser(USER_ID, details)).toEqual({
      ok: false,
      reason: "no-recruiter-profile",
    });
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it("refuses a banned recruiter", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ isBanned: true }));
    expect(await updateVerificationDetailsForUser(USER_ID, details)).toEqual({
      ok: false,
      reason: "banned",
    });
  });

  it("refuses once the badge is granted — evidence cannot be swapped under it", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state({ tier: "VERIFIED" }));
    expect(await updateVerificationDetailsForUser(USER_ID, details)).toEqual({
      ok: false,
      reason: "already-verified",
    });
    expect(mockUpdateDetails).not.toHaveBeenCalled();

    mockState.mockResolvedValue(state({ tier: "TRUSTED" }));
    expect(await updateVerificationDetailsForUser(USER_ID, details)).toEqual({
      ok: false,
      reason: "already-verified",
    });
  });

  it("saves the evidence while UNVERIFIED", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(state());
    expect(await updateVerificationDetailsForUser(USER_ID, details)).toEqual({ ok: true });
    expect(mockUpdateDetails).toHaveBeenCalledWith(REC_ID, details);
    // Never touches the tier.
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it("lets a rejected recruiter fix exactly what the reviewer objected to", async () => {
    mockAuth.mockResolvedValue(account());
    mockState.mockResolvedValue(
      state({ verificationNote: "Registration number doesn't match Companies House." }),
    );
    const fixed = { ...details, registrationNo: "12345678" };
    expect(await updateVerificationDetailsForUser(USER_ID, fixed)).toEqual({ ok: true });
    expect(mockUpdateDetails).toHaveBeenCalledWith(REC_ID, fixed);
  });
});
