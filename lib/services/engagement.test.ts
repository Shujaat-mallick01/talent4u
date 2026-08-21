import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/engagement", () => ({
  amendEngagementTermsTx: vi.fn(),
  confirmEngagementTx: vi.fn(),
  createReviewTx: vi.fn(),
  declineEngagementTx: vi.fn(),
  getApplicationParties: vi.fn(),
  getEngagementById: vi.fn(),
  listClaimedPairs: vi.fn(),
  listEngageableApplications: vi.fn(),
  listEngagementsForFreelancer: vi.fn(),
  listEngagementsForRecruiter: vi.fn(),
  proposeEngagementTx: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({
  getFreelancerProfileByUserId: vi.fn(),
  getRecruiterProfileByUserId: vi.fn(),
  getUserAuthState: vi.fn(),
}));
vi.mock("./recruiter-verification", () => ({ evaluateTrustedPromotion: vi.fn() }));

import {
  amendEngagementTermsTx,
  confirmEngagementTx,
  createReviewTx,
  declineEngagementTx,
  getApplicationParties,
  getEngagementById,
  listClaimedPairs,
  listEngageableApplications,
  listEngagementsForFreelancer,
  listEngagementsForRecruiter,
  proposeEngagementTx,
} from "@/lib/db/engagement";
import {
  getFreelancerProfileByUserId,
  getRecruiterProfileByUserId,
  getUserAuthState,
} from "@/lib/db/users";

import {
  amendEngagementTermsForUser,
  confirmEngagementForUser,
  declineEngagementForUser,
  listEngagementsForUser,
  proposeEngagementForUser,
  writeReviewForUser,
} from "./engagement";
import { evaluateTrustedPromotion } from "./recruiter-verification";

const mockAuth = vi.mocked(getUserAuthState);
const mockFreelancer = vi.mocked(getFreelancerProfileByUserId);
const mockRecruiter = vi.mocked(getRecruiterProfileByUserId);
const mockGet = vi.mocked(getEngagementById);
const mockConfirm = vi.mocked(confirmEngagementTx);
const mockDecline = vi.mocked(declineEngagementTx);
const mockAmend = vi.mocked(amendEngagementTermsTx);
const mockCreateReview = vi.mocked(createReviewTx);
const mockPropose = vi.mocked(proposeEngagementTx);
const mockParties = vi.mocked(getApplicationParties);
const mockListFreelancer = vi.mocked(listEngagementsForFreelancer);
const mockListRecruiter = vi.mocked(listEngagementsForRecruiter);
const mockEngageable = vi.mocked(listEngageableApplications);
const mockClaimed = vi.mocked(listClaimedPairs);
const mockPromote = vi.mocked(evaluateTrustedPromotion);

const FREELANCER_USER = "00000000-0000-4000-8000-0000000000f1";
const RECRUITER_USER = "00000000-0000-4000-8000-0000000000r1";
const FL_ID = "fl_1";
const REC_ID = "rec_1";
const ENG_ID = "eng_1";
const OTHER_FL = "fl_999";

type Profile = { id: string; isBanned?: boolean };

const asFreelancer = (id = FL_ID) => {
  mockAuth.mockResolvedValue({
    id: FREELANCER_USER,
    email: "f@x.test",
    role: "FREELANCER",
    hasProfile: true,
  });
  mockFreelancer.mockResolvedValue({ id } as unknown as Awaited<
    ReturnType<typeof getFreelancerProfileByUserId>
  >);
};

const asRecruiter = (profile: Profile = { id: REC_ID, isBanned: false }) => {
  mockAuth.mockResolvedValue({
    id: RECRUITER_USER,
    email: "r@x.test",
    role: "RECRUITER",
    hasProfile: true,
  });
  mockRecruiter.mockResolvedValue(profile as unknown as Awaited<
    ReturnType<typeof getRecruiterProfileByUserId>
  >);
};

const engagement = (over: Record<string, unknown> = {}) =>
  ({
    id: ENG_ID,
    jobId: "job_1",
    freelancerId: FL_ID,
    recruiterId: REC_ID,
    statedRateUsd: 4000,
    durationWeeks: 6,
    freelancerConfirmed: false,
    recruiterConfirmed: true,
    isConfirmed: false,
    confirmedAt: null,
    declinedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    job: { id: "job_1", slug: "job", title: "Job", status: "ACTIVE" },
    freelancer: { id: FL_ID, slug: "fl", displayName: "Dev", verification: "NONE" },
    recruiter: { id: REC_ID, slug: "co", companyName: "Co", tier: "VERIFIED", isBanned: false },
    reviews: [],
    ...over,
  }) as unknown as NonNullable<Awaited<ReturnType<typeof getEngagementById>>>;

const CONFIRMED = { freelancerConfirmed: true, recruiterConfirmed: true, isConfirmed: true };

/** The figures the fixture engagement renders, as the confirm form would post them. */
const SEEN = { statedRateUsd: 4000, durationWeeks: 6 };

beforeEach(() => {
  vi.resetAllMocks();
  mockPromote.mockResolvedValue(false);
});

/**
 * The rule from CLAUDE.md: reviews are locked until BOTH parties confirm, and
 * a one-sided review is never allowed. These tests hold the service half of
 * that; the database half (composite FK + CHECK) is covered by
 * prisma/verify-engagement.ts against a live database.
 */
describe("writeReviewForUser", () => {
  const input = { engagementId: ENG_ID, rating: 5, body: "x".repeat(60) };

  it("refuses a review on an engagement only one side confirmed", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));

    expect(await writeReviewForUser(FREELANCER_USER, input)).toEqual({
      ok: false,
      reason: "not-confirmed",
    });
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it("refuses a review on a declined engagement", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(
      engagement({ recruiterConfirmed: true, declinedAt: new Date("2026-08-02") }),
    );

    expect(await writeReviewForUser(FREELANCER_USER, input)).toEqual({
      ok: false,
      reason: "not-confirmed",
    });
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it("refuses a stranger who is party to neither side", async () => {
    asFreelancer(OTHER_FL);
    mockGet.mockResolvedValue(engagement(CONFIRMED));

    expect(await writeReviewForUser(FREELANCER_USER, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it("derives author and subject from the caller's side, never from input", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement(CONFIRMED));
    mockCreateReview.mockResolvedValue({ ok: true, reviewId: "rev_1" });

    expect(await writeReviewForUser(FREELANCER_USER, input)).toEqual({
      ok: true,
      reviewId: "rev_1",
    });
    expect(mockCreateReview).toHaveBeenCalledWith({
      engagementId: ENG_ID,
      side: "FREELANCER",
      // The freelancer authors; the recruiter is the subject. Never the reverse.
      authorProfileId: FL_ID,
      subjectProfileId: REC_ID,
      rating: 5,
      body: input.body,
    });
  });

  it("points a recruiter's review at the freelancer", async () => {
    asRecruiter();
    mockGet.mockResolvedValue(engagement(CONFIRMED));
    mockCreateReview.mockResolvedValue({ ok: true, reviewId: "rev_2" });

    await writeReviewForUser(RECRUITER_USER, input);
    expect(mockCreateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "RECRUITER",
        authorProfileId: REC_ID,
        subjectProfileId: FL_ID,
      }),
    );
  });

  it("refuses a banned employer", async () => {
    asRecruiter({ id: REC_ID, isBanned: true });
    expect(await writeReviewForUser(RECRUITER_USER, input)).toEqual({
      ok: false,
      reason: "banned",
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("surfaces a second review attempt as already-reviewed", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement(CONFIRMED));
    mockCreateReview.mockResolvedValue({ ok: false, reason: "already-reviewed" });

    expect(await writeReviewForUser(FREELANCER_USER, input)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });
});

describe("confirmEngagementForUser", () => {
  it("refuses the proposer confirming their own claim a second time", async () => {
    asRecruiter();
    // Proposed by the recruiter: their own boolean is already true.
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));

    expect(await confirmEngagementForUser(RECRUITER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "already-confirmed",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("lets the counterparty confirm and runs the TRUSTED evaluation", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));
    mockConfirm.mockResolvedValue({ ok: true, recruiterId: REC_ID });
    mockPromote.mockResolvedValue(true);

    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: true,
      promotedToTrusted: true,
    });
    // The figures the party was shown travel into the locked comparison.
    expect(mockConfirm).toHaveBeenCalledWith({
      engagementId: ENG_ID,
      side: "FREELANCER",
      expectedRateUsd: 4000,
      expectedDurationWeeks: 6,
    });
    expect(mockPromote).toHaveBeenCalledWith(REC_ID);
  });

  it("does not evaluate promotion when the confirmation did not apply", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));
    mockConfirm.mockResolvedValue({ ok: false, reason: "not-pending" });

    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "not-pending",
    });
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it("refuses to hand a confirmation to a removed employer", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(
      engagement({ recruiter: { id: REC_ID, slug: "co", companyName: "Co", tier: "VERIFIED", isBanned: true } }),
    );

    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "recruiter-banned",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("refuses a stranger, reporting not-found rather than confirming the row exists", async () => {
    asFreelancer(OTHER_FL);
    mockGet.mockResolvedValue(engagement());

    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("refuses a confirmation carrying terms the proposer has since changed", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));
    mockConfirm.mockResolvedValue({ ok: false, reason: "terms-changed" });

    // The party clicked on a page showing $4,000 / 6 weeks; the proposer
    // amended it underneath them. Confirming would put them on record as
    // agreeing to figures they never saw.
    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "terms-changed",
    });
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it("passes the party's own figures through, not the ones on the row", async () => {
    asFreelancer();
    // The row already moved to 200/1; the click still carries what was shown.
    mockGet.mockResolvedValue(
      engagement({ recruiterConfirmed: true, statedRateUsd: 200, durationWeeks: 1 }),
    );
    mockConfirm.mockResolvedValue({ ok: false, reason: "terms-changed" });

    await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRateUsd: 4000, expectedDurationWeeks: 6 }),
    );
  });

  it("refuses to confirm an engagement with no stated rate and duration", async () => {
    asFreelancer();
    // CLAUDE.md: the parties confirm they worked together WITH stated rate and
    // duration. Confirming empty terms would still unlock reviews and count
    // toward TRUSTED, so it is refused rather than treated as an agreement.
    mockGet.mockResolvedValue(
      engagement({ recruiterConfirmed: true, statedRateUsd: null, durationWeeks: null }),
    );

    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "terms-missing",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockPromote).not.toHaveBeenCalled();
  });

  it("refuses to confirm when only one of the two terms is stated", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true, durationWeeks: null }));

    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "terms-missing",
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("refuses an engagement that is already confirmed by both", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement(CONFIRMED));

    expect(await confirmEngagementForUser(FREELANCER_USER, ENG_ID, SEEN)).toEqual({
      ok: false,
      reason: "not-pending",
    });
  });
});

describe("declineEngagementForUser", () => {
  it("lets the counterparty refuse", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));
    mockDecline.mockResolvedValue({ ok: true });

    expect(await declineEngagementForUser(FREELANCER_USER, ENG_ID)).toEqual({ ok: true });
    expect(mockDecline).toHaveBeenCalledWith({ engagementId: ENG_ID, side: "FREELANCER" });
  });

  it("does not let the proposer decline their own claim", async () => {
    asRecruiter();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));

    expect(await declineEngagementForUser(RECRUITER_USER, ENG_ID)).toEqual({
      ok: false,
      reason: "not-pending",
    });
    expect(mockDecline).not.toHaveBeenCalled();
  });
});

describe("amendEngagementTermsForUser", () => {
  const terms = { statedRateUsd: 5000, durationWeeks: 8 };

  it("lets the proposer correct the figures while the other side is undecided", async () => {
    asRecruiter();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));
    mockAmend.mockResolvedValue({ ok: true });

    expect(await amendEngagementTermsForUser(RECRUITER_USER, ENG_ID, terms)).toEqual({ ok: true });
    expect(mockAmend).toHaveBeenCalledWith({
      engagementId: ENG_ID,
      side: "RECRUITER",
      ...terms,
    });
  });

  it("refuses once both sides confirmed the exact figures", async () => {
    asRecruiter();
    mockGet.mockResolvedValue(engagement(CONFIRMED));

    expect(await amendEngagementTermsForUser(RECRUITER_USER, ENG_ID, terms)).toEqual({
      ok: false,
      reason: "not-pending",
    });
    expect(mockAmend).not.toHaveBeenCalled();
  });

  it("refuses the side that did not propose", async () => {
    asFreelancer();
    mockGet.mockResolvedValue(engagement({ recruiterConfirmed: true }));

    expect(await amendEngagementTermsForUser(FREELANCER_USER, ENG_ID, terms)).toEqual({
      ok: false,
      reason: "not-pending",
    });
  });
});

describe("proposeEngagementForUser", () => {
  const input = { applicationId: "app_1", statedRateUsd: 4000, durationWeeks: 6 };

  const application = (over: Record<string, unknown> = {}) =>
    ({
      id: "app_1",
      freelancerId: FL_ID,
      freelancer: { userId: FREELANCER_USER, displayName: "Dev" },
      job: {
        id: "job_1",
        title: "Job",
        recruiterId: REC_ID,
        recruiter: { userId: RECRUITER_USER, companyName: "Co", isBanned: false },
      },
      ...over,
    }) as unknown as NonNullable<Awaited<ReturnType<typeof getApplicationParties>>>;

  it("derives both parties from the application, not from the caller's input", async () => {
    asRecruiter();
    mockParties.mockResolvedValue(application());
    mockPropose.mockResolvedValue({ ok: true, engagementId: ENG_ID });

    expect(await proposeEngagementForUser(RECRUITER_USER, input)).toEqual({
      ok: true,
      engagementId: ENG_ID,
    });
    expect(mockPropose).toHaveBeenCalledWith({
      jobId: "job_1",
      freelancerId: FL_ID,
      recruiterId: REC_ID,
      statedRateUsd: 4000,
      durationWeeks: 6,
      // The proposer is recorded as already confirmed — proposing IS asserting.
      proposedBy: "RECRUITER",
    });
  });

  it("refuses a recruiter who does not own the job the application is on", async () => {
    asRecruiter({ id: "rec_other", isBanned: false });
    mockParties.mockResolvedValue(application());

    expect(await proposeEngagementForUser(RECRUITER_USER, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("refuses a freelancer who did not send the application", async () => {
    asFreelancer(OTHER_FL);
    mockParties.mockResolvedValue(application());

    expect(await proposeEngagementForUser(FREELANCER_USER, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("refuses to record work for a removed employer", async () => {
    asFreelancer();
    mockParties.mockResolvedValue(
      application({
        job: {
          id: "job_1",
          title: "Job",
          recruiterId: REC_ID,
          recruiter: { userId: RECRUITER_USER, companyName: "Co", isBanned: true },
        },
      }),
    );

    expect(await proposeEngagementForUser(FREELANCER_USER, input)).toEqual({
      ok: false,
      reason: "recruiter-banned",
    });
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("reports a duplicate rather than filing the same claim twice", async () => {
    asRecruiter();
    mockParties.mockResolvedValue(application());
    mockPropose.mockResolvedValue({ ok: false, reason: "already-exists" });

    expect(await proposeEngagementForUser(RECRUITER_USER, input)).toEqual({
      ok: false,
      reason: "already-exists",
    });
  });
});

describe("listEngagementsForUser", () => {
  it("does not offer an application that already has an engagement", async () => {
    asRecruiter();
    mockListRecruiter.mockResolvedValue([
      engagement({ jobId: "job_1", freelancerId: FL_ID }),
    ] as never);
    mockEngageable.mockResolvedValue([
      { id: "app_1", freelancerId: FL_ID, job: { id: "job_1" } },
      { id: "app_2", freelancerId: OTHER_FL, job: { id: "job_1" } },
    ] as never);
    // Comes from its own uncapped query, NOT from the display list — an
    // engagement past the display cap must still block its application.
    mockClaimed.mockResolvedValue(new Set([`job_1:${FL_ID}`]));

    const result = await listEngagementsForUser(RECRUITER_USER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A DECLINED engagement occupies the pair too — the unique constraint keeps
    // it there, so re-offering it would only produce a failed insert.
    expect(result.proposable.map((a) => a.id)).toEqual(["app_2"]);
  });

  it("reports the viewer's own side so the page renders their half", async () => {
    asFreelancer();
    mockListFreelancer.mockResolvedValue([]);
    mockEngageable.mockResolvedValue([]);
    mockClaimed.mockResolvedValue(new Set());

    const result = await listEngagementsForUser(FREELANCER_USER);
    expect(result).toMatchObject({ ok: true, side: "FREELANCER", cards: [], proposable: [] });
  });

  it("refuses a banned employer", async () => {
    asRecruiter({ id: REC_ID, isBanned: true });
    expect(await listEngagementsForUser(RECRUITER_USER)).toEqual({ ok: false, reason: "banned" });
  });

  it("gives an admin no standing — they are party to nobody's engagement", async () => {
    mockAuth.mockResolvedValue({
      id: "admin",
      email: "a@x.test",
      role: "ADMIN",
      hasProfile: true,
    });
    expect(await listEngagementsForUser("admin")).toEqual({ ok: false, reason: "no-profile" });
  });
});
