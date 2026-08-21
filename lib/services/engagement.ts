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
  type EngageableApplication,
  type EngagementView,
} from "@/lib/db/engagement";
import {
  getFreelancerProfileByUserId,
  getRecruiterProfileByUserId,
  getUserAuthState,
} from "@/lib/db/users";
import type { EngagementTermsInput, ProposeEngagementInput } from "@/lib/validations/engagement";
import type { WriteReviewInput } from "@/lib/validations/review";

import {
  canAmendTerms,
  canRespond,
  canWriteReview,
  engagementState,
  reviewsUnlocked,
  type EngagementSide,
  type EngagementState,
} from "./engagement-state";
import { evaluateTrustedPromotion } from "./recruiter-verification";

/**
 * Engagement orchestration — mutual confirmation, and the reviews it unlocks.
 *
 * CLAUDE.md: "Reviews are locked until BOTH parties confirm they worked
 * together, with stated rate and duration. This is our substitute for payment
 * data. Never allow one-sided reviews."
 *
 * Everything a caller sends is an id plus terms. Which side of an engagement
 * they are on is resolved here from their session's own profile, never from
 * the request — so the only thing a forged request can do is name an
 * engagement it is not party to, which every entry point below refuses.
 */

export type ViewerSide = { side: EngagementSide; profileId: string };

/** The caller's own profile, or why they have no standing to act at all. */
async function resolveViewer(
  userId: string,
): Promise<
  { ok: true; viewer: ViewerSide } | { ok: false; reason: "no-profile" | "banned" }
> {
  // Role comes from the account row, so exactly one profile lookup runs — and
  // an ADMIN, who has no side in anyone's engagement, falls straight through.
  const account = await getUserAuthState(userId);
  if (!account) return { ok: false, reason: "no-profile" };

  if (account.role === "FREELANCER") {
    const freelancer = await getFreelancerProfileByUserId(userId);
    return freelancer
      ? { ok: true, viewer: { side: "FREELANCER", profileId: freelancer.id } }
      : { ok: false, reason: "no-profile" };
  }

  if (account.role === "RECRUITER") {
    const recruiter = await getRecruiterProfileByUserId(userId);
    if (!recruiter) return { ok: false, reason: "no-profile" };
    // A banned company keeps its history but takes no new action: it must not
    // be able to mint confirmations toward a badge or publish new reviews.
    if (recruiter.isBanned) return { ok: false, reason: "banned" };
    return { ok: true, viewer: { side: "RECRUITER", profileId: recruiter.id } };
  }

  return { ok: false, reason: "no-profile" };
}

/** Is this viewer actually a party to this engagement? */
const isParty = (engagement: EngagementView, viewer: ViewerSide): boolean =>
  viewer.side === "FREELANCER"
    ? engagement.freelancerId === viewer.profileId
    : engagement.recruiterId === viewer.profileId;

export type EngagementFailure = { ok: false; reason: "no-profile" | "banned" | "not-found" };

/**
 * Loads an engagement the caller is party to. A row belonging to other people
 * reports "not-found", not "forbidden" — the difference between the two is
 * exactly the signal that turns an id guess into confirmation that a given
 * engagement exists, and outsiders do not get to enumerate.
 */
async function loadAsParty(
  userId: string,
  engagementId: string,
): Promise<
  { ok: true; engagement: EngagementView; viewer: ViewerSide } | EngagementFailure
> {
  const resolved = await resolveViewer(userId);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const engagement = await getEngagementById(engagementId);
  if (!engagement) return { ok: false, reason: "not-found" };
  if (!isParty(engagement, resolved.viewer)) return { ok: false, reason: "not-found" };

  return { ok: true, engagement, viewer: resolved.viewer };
}

// ── Reading ────────────────────────────────────────────────────────────────

/** One engagement as the viewer sees it: state, and what they may do next. */
export type EngagementCard = {
  engagement: EngagementView;
  state: EngagementState;
  side: EngagementSide;
  /** This viewer must answer a claim the other side filed. */
  canRespond: boolean;
  /** …and confirming it is actually possible right now. */
  canConfirm: boolean;
  /** This viewer proposed it and may still correct the terms. */
  canAmend: boolean;
  canReview: boolean;
  /** Both figures are on the row, so there is something specific to confirm. */
  termsStated: boolean;
  /** The employer has been removed from Talent4u since this was filed. */
  counterpartyRemoved: boolean;
  /** The review this viewer wrote, if any. */
  ownReview: EngagementView["reviews"][number] | null;
  /** The review written ABOUT this viewer, if any. */
  receivedReview: EngagementView["reviews"][number] | null;
};

function toCard(engagement: EngagementView, viewer: ViewerSide): EngagementCard {
  const authoredByViewer = (review: EngagementView["reviews"][number]) =>
    viewer.side === "FREELANCER"
      ? review.authorFreelancerId === viewer.profileId
      : review.authorRecruiterId === viewer.profileId;

  const ownReview = engagement.reviews.find(authoredByViewer) ?? null;
  const receivedReview = engagement.reviews.find((r) => !authoredByViewer(r)) ?? null;

  const termsStated = engagement.statedRateUsd !== null && engagement.durationWeeks !== null;
  // Banning does not touch existing engagements, so a pending claim from a
  // company removed since it was filed stays on the counterparty's dashboard.
  // Every action on it is refused server-side; the flags say so up front
  // rather than offering buttons that can only ever fail.
  const counterpartyRemoved = engagement.recruiter.isBanned;
  const actionable = !counterpartyRemoved;
  const respondable = canRespond(engagement, viewer.side);

  return {
    engagement,
    state: engagementState(engagement),
    side: viewer.side,
    // Declining stays open even against a removed employer: it is how someone
    // clears a bogus claim off their own dashboard, and it can never help the
    // company it names.
    canRespond: respondable,
    // Confirming means agreeing to SPECIFIC figures, and it hands the company
    // credit toward TRUSTED. With no figures stated, or the company removed,
    // there is nothing to agree to — so the affordance is withheld rather than
    // shown and then refused.
    canConfirm: respondable && termsStated && actionable,
    canAmend: canAmendTerms(engagement, viewer.side) && actionable,
    canReview: canWriteReview(engagement, viewer.side, ownReview !== null) && actionable,
    termsStated,
    counterpartyRemoved,
    ownReview,
    receivedReview,
  };
}

export type EngagementsPage = {
  side: EngagementSide;
  cards: EngagementCard[];
  /** Applications with no engagement yet — the "record one" picker's options. */
  proposable: EngageableApplication[];
};

export type EngagementListResult =
  | ({ ok: true } & EngagementsPage)
  | { ok: false; reason: "no-profile" | "banned" };

/**
 * Everything either dashboard's engagements page renders, resolved once.
 *
 * The proposable list is the applications not already claimed. The pair
 * (jobId, freelancerId) is the right key because that is exactly what
 * Engagement_recruiterId_freelancerId_jobId_key makes unique — so an option
 * that survives this filter is one the insert will actually accept, and a
 * DECLINED engagement correctly keeps its application out of the list rather
 * than offering a refused claim for re-filing.
 */
export async function listEngagementsForUser(userId: string): Promise<EngagementListResult> {
  const resolved = await resolveViewer(userId);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const { viewer } = resolved;
  const [rows, applications, claimed] = await Promise.all([
    viewer.side === "FREELANCER"
      ? listEngagementsForFreelancer(viewer.profileId)
      : listEngagementsForRecruiter(viewer.profileId),
    listEngageableApplications(viewer),
    // NOT derived from `rows`: that list is capped for display, and a pair
    // whose engagement fell past the cap would be offered again for a claim
    // the unique constraint can only reject.
    listClaimedPairs(viewer),
  ]);

  const proposable = applications.filter(
    (app) => !claimed.has(`${app.job.id}:${app.freelancerId}`),
  );

  return {
    ok: true,
    side: viewer.side,
    cards: rows.map((row) => toCard(row, viewer)),
    proposable,
  };
}

// ── Proposing ──────────────────────────────────────────────────────────────

export type ProposeResult =
  | { ok: true; engagementId: string }
  | {
      ok: false;
      reason:
        | "no-profile"
        | "banned"
        | "not-found"
        | "already-exists"
        | "recruiter-banned";
    };

/**
 * Files a claim that two parties worked together, derived from an application
 * they already share. Either side may propose; the proposer is recorded as
 * confirmed, and the claim counts for nothing until the other side agrees.
 *
 * Deriving the parties from the application — instead of accepting a
 * freelancerId and recruiterId — is the anti-abuse property that matters. It
 * means a recruiter cannot manufacture engagements against strangers to farm
 * the three confirmations that grant TRUSTED; they can only ask people who
 * actually applied to their job, and those people have to say yes.
 */
export async function proposeEngagementForUser(
  userId: string,
  input: ProposeEngagementInput,
): Promise<ProposeResult> {
  const resolved = await resolveViewer(userId);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const { viewer } = resolved;

  const application = await getApplicationParties(input.applicationId);
  if (!application) return { ok: false, reason: "not-found" };

  const { job } = application;
  const isApplicationParty =
    viewer.side === "FREELANCER"
      ? application.freelancerId === viewer.profileId
      : job.recruiterId === viewer.profileId;
  if (!isApplicationParty) return { ok: false, reason: "not-found" };

  // A freelancer must not be able to hand a banned company a confirmation.
  if (job.recruiter.isBanned) return { ok: false, reason: "recruiter-banned" };

  return proposeEngagementTx({
    jobId: job.id,
    freelancerId: application.freelancerId,
    recruiterId: job.recruiterId,
    statedRateUsd: input.statedRateUsd,
    durationWeeks: input.durationWeeks,
    proposedBy: viewer.side,
  });
}

// ── Responding ─────────────────────────────────────────────────────────────

export type ConfirmResult =
  | { ok: true; promotedToTrusted: boolean }
  | {
      ok: false;
      reason:
        | "no-profile"
        | "banned"
        | "not-found"
        | "not-pending"
        | "already-confirmed"
        | "recruiter-banned"
        | "terms-missing"
        | "terms-changed";
    };

/**
 * The second confirmation — the moment an engagement becomes real. Unlocks
 * reviews for both sides and re-evaluates the recruiter for TRUSTED, which
 * CLAUDE.md grants at three mutually confirmed engagements.
 *
 * `seen` is the rate and duration the confirming party had in front of them.
 * What is being confirmed is a specific claim, not an id — and the proposer
 * may still amend the figures — so the confirmation is refused unless the
 * stored terms are the ones the party actually agreed to.
 */
export async function confirmEngagementForUser(
  userId: string,
  engagementId: string,
  seen: EngagementTermsInput,
): Promise<ConfirmResult> {
  const loaded = await loadAsParty(userId, engagementId);
  if (!loaded.ok) return loaded;

  const { engagement, viewer } = loaded;
  if (engagement.recruiter.isBanned) return { ok: false, reason: "recruiter-banned" };
  // CLAUDE.md: both parties confirm they worked together "with stated rate and
  // duration". The columns are nullable for rows that predate this rule, so a
  // confirmation is refused unless there are actual terms to confirm —
  // otherwise the parties would be agreeing to nothing in particular, and that
  // agreement would still unlock reviews and count toward TRUSTED.
  if (engagement.statedRateUsd === null || engagement.durationWeeks === null) {
    return { ok: false, reason: "terms-missing" };
  }
  // Cheap pre-check for a clear message; confirmEngagementTx re-decides this
  // under the row lock, and that decision is the authoritative one.
  if (!canRespond(engagement, viewer.side)) {
    return {
      ok: false,
      reason: engagementState(engagement) === "PENDING" ? "already-confirmed" : "not-pending",
    };
  }

  const result = await confirmEngagementTx({
    engagementId,
    side: viewer.side,
    expectedRateUsd: seen.statedRateUsd,
    expectedDurationWeeks: seen.durationWeeks,
  });
  if (!result.ok) return result;

  // Runs after the confirming transaction commits, so the promotion counts a
  // durable engagement. Idempotent, and a no-op for anyone not VERIFIED.
  const promotedToTrusted = await evaluateTrustedPromotion(result.recruiterId);
  return { ok: true, promotedToTrusted };
}

export type DeclineResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no-profile" | "banned" | "not-found" | "not-pending";
    };

/** Refusing a claim. Terminal, and it blocks the same claim being re-filed. */
export async function declineEngagementForUser(
  userId: string,
  engagementId: string,
): Promise<DeclineResult> {
  const loaded = await loadAsParty(userId, engagementId);
  if (!loaded.ok) return loaded;

  const { engagement, viewer } = loaded;
  if (!canRespond(engagement, viewer.side)) return { ok: false, reason: "not-pending" };

  return declineEngagementTx({ engagementId, side: viewer.side });
}

export type AmendResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no-profile" | "banned" | "not-found" | "not-pending";
    };

/** The proposer corrects the stated terms, while the other side is undecided. */
export async function amendEngagementTermsForUser(
  userId: string,
  engagementId: string,
  input: EngagementTermsInput,
): Promise<AmendResult> {
  const loaded = await loadAsParty(userId, engagementId);
  if (!loaded.ok) return loaded;

  const { engagement, viewer } = loaded;
  if (!canAmendTerms(engagement, viewer.side)) return { ok: false, reason: "not-pending" };

  return amendEngagementTermsTx({
    engagementId,
    side: viewer.side,
    statedRateUsd: input.statedRateUsd,
    durationWeeks: input.durationWeeks,
  });
}

// ── Reviews ────────────────────────────────────────────────────────────────

export type WriteReviewResult =
  | { ok: true; reviewId: string }
  | {
      ok: false;
      reason:
        | "no-profile"
        | "banned"
        | "not-found"
        | "not-confirmed"
        | "already-reviewed";
    };

/**
 * Writes the caller's one review of the other party.
 *
 * The lock this enforces is the product's whole trust model, so it is checked
 * three times over: here against the loaded row, again by createReviewTx's
 * composite FK into Engagement(id, isConfirmed = true), and by the CHECK
 * pinning engagementIsConfirmed. A one-sided review is not merely refused by
 * this function — it has nowhere to be stored.
 *
 * Author and subject are derived from the caller's side, never sent by them.
 */
export async function writeReviewForUser(
  userId: string,
  input: WriteReviewInput,
): Promise<WriteReviewResult> {
  const loaded = await loadAsParty(userId, input.engagementId);
  if (!loaded.ok) return loaded;

  const { engagement, viewer } = loaded;
  if (!reviewsUnlocked(engagement)) return { ok: false, reason: "not-confirmed" };

  const subjectProfileId =
    viewer.side === "FREELANCER" ? engagement.recruiterId : engagement.freelancerId;

  return createReviewTx({
    engagementId: input.engagementId,
    side: viewer.side,
    authorProfileId: viewer.profileId,
    subjectProfileId,
    rating: input.rating,
    body: input.body,
  });
}
