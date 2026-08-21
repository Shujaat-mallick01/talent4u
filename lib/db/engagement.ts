import { Prisma } from "@/lib/generated/prisma/client";
import type { EngagementSide } from "@/lib/services/engagement-state";
import { isPlausibleId } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * Prisma access for engagements and reviews.
 *
 * The invariant this file protects is the one CLAUDE.md calls our substitute
 * for payment data: an engagement counts only when BOTH parties confirmed it,
 * and a review exists only against such an engagement. Three layers hold it:
 *
 *   1. Here, in a transaction that locks the engagement row before flipping a
 *      confirmation, so two simultaneous confirmations cannot both read the
 *      other side as unconfirmed and both report "still pending" — which would
 *      leave a mutually-confirmed engagement whose promotion never ran.
 *   2. A trigger + CHECK deriving isConfirmed/confirmedAt from the two
 *      booleans, so no writer can set them independently.
 *   3. Review's composite FK into Engagement(id, isConfirmed) with
 *      engagementIsConfirmed pinned true, so a review against an unconfirmed
 *      engagement has no FK target and fails from any client.
 */

const ENGAGEMENT_CORE = {
  id: true,
  jobId: true,
  freelancerId: true,
  recruiterId: true,
  statedRateUsd: true,
  durationWeeks: true,
  freelancerConfirmed: true,
  recruiterConfirmed: true,
  isConfirmed: true,
  confirmedAt: true,
  declinedAt: true,
  createdAt: true,
} satisfies Prisma.EngagementSelect;

/** The counterparty and job detail both dashboards render. */
const ENGAGEMENT_VIEW = {
  ...ENGAGEMENT_CORE,
  job: { select: { id: true, slug: true, title: true, status: true } },
  freelancer: { select: { id: true, slug: true, displayName: true, verification: true } },
  recruiter: { select: { id: true, slug: true, companyName: true, tier: true, isBanned: true } },
  reviews: {
    select: {
      id: true,
      rating: true,
      body: true,
      createdAt: true,
      authorFreelancerId: true,
      authorRecruiterId: true,
    },
  },
} satisfies Prisma.EngagementSelect;

export type EngagementView = Prisma.EngagementGetPayload<{ select: typeof ENGAGEMENT_VIEW }>;

export async function getEngagementById(engagementId: string): Promise<EngagementView | null> {
  if (!isPlausibleId(engagementId)) return null;
  return prisma.engagement.findUnique({
    where: { id: engagementId },
    select: ENGAGEMENT_VIEW,
  });
}

/**
 * Every engagement one side is party to, newest first.
 *
 * Capped: a Team-plan agency accumulates engagements indefinitely, and this
 * select pulls both parties, the job, and the reviews for each row. Newest
 * first means the cap drops the oldest — which are the settled, already
 * reviewed ones, not the pending answers the page exists to surface.
 */
const ENGAGEMENT_PAGE_SIZE = 200;

export async function listEngagementsForFreelancer(
  freelancerId: string,
): Promise<EngagementView[]> {
  return prisma.engagement.findMany({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
    take: ENGAGEMENT_PAGE_SIZE,
    select: ENGAGEMENT_VIEW,
  });
}

export async function listEngagementsForRecruiter(recruiterId: string): Promise<EngagementView[]> {
  return prisma.engagement.findMany({
    where: { recruiterId },
    orderBy: { createdAt: "desc" },
    take: ENGAGEMENT_PAGE_SIZE,
    select: ENGAGEMENT_VIEW,
  });
}

/**
 * The application a proposal is derived from, with both parties resolved.
 * Returning the ids from the APPLICATION — rather than accepting them from the
 * caller — is what makes it impossible to file a claim between two people the
 * proposer has nothing to do with.
 */
export async function getApplicationParties(applicationId: string) {
  if (!isPlausibleId(applicationId)) return null;
  return prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      freelancerId: true,
      freelancer: { select: { userId: true, displayName: true } },
      job: {
        select: {
          id: true,
          title: true,
          recruiterId: true,
          recruiter: { select: { userId: true, companyName: true, isBanned: true } },
        },
      },
    },
  });
}

/**
 * Every (job, freelancer) pair this side has already filed, confirmed, or had
 * declined — the exact key Engagement_recruiterId_freelancerId_jobId_key makes
 * unique.
 *
 * Deliberately separate from the capped list queries above and deliberately
 * uncapped: this drives the "already claimed" filter, and computing it from a
 * truncated page would re-offer an old pair whose insert can only fail. Two
 * scalar columns per row, so it stays cheap where the display query is not.
 */
export async function listClaimedPairs(args: {
  side: EngagementSide;
  profileId: string;
}): Promise<Set<string>> {
  const { side, profileId } = args;
  const rows = await prisma.engagement.findMany({
    where: side === "FREELANCER" ? { freelancerId: profileId } : { recruiterId: profileId },
    select: { jobId: true, freelancerId: true },
  });
  return new Set(rows.map((row) => `${row.jobId}:${row.freelancerId}`));
}

/**
 * The applications one side could still turn into an engagement claim.
 *
 * WITHDRAWN is excluded: the freelancer already said "not this one", and
 * offering to record it as work would be strange. Every other status stays,
 * REJECTED included — a recruiter who passed on an application and later
 * worked with the same person still has a real engagement to record, and the
 * counterparty's confirmation is the check that matters either way.
 */
export async function listEngageableApplications(args: {
  side: EngagementSide;
  profileId: string;
}) {
  const { side, profileId } = args;
  return prisma.application.findMany({
    where: {
      status: { not: "WITHDRAWN" },
      ...(side === "FREELANCER"
        ? { freelancerId: profileId, job: { recruiter: { isBanned: false } } }
        : { job: { recruiterId: profileId } }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      proposedRateUsd: true,
      freelancerId: true,
      freelancer: { select: { displayName: true } },
      job: {
        select: {
          id: true,
          title: true,
          engagementType: true,
          recruiter: { select: { companyName: true } },
        },
      },
    },
  });
}

export type EngageableApplication = Awaited<
  ReturnType<typeof listEngageableApplications>
>[number];

export type ProposeTxResult =
  | { ok: true; engagementId: string }
  | { ok: false; reason: "already-exists" };

/**
 * Creates the engagement with the PROPOSER already confirmed — proposing is
 * the assertion, so it would be theatre to make them confirm it again. The
 * other side's boolean stays false until they answer.
 *
 * A duplicate is refused by Engagement_recruiterId_freelancerId_jobId_key
 * rather than by a read-then-write, so two concurrent proposals cannot both
 * land. That constraint also holds a DECLINED row in place, which is what
 * stops a refused claim from being re-filed at the same person.
 */
export async function proposeEngagementTx(args: {
  jobId: string;
  freelancerId: string;
  recruiterId: string;
  statedRateUsd: number;
  durationWeeks: number;
  proposedBy: EngagementSide;
}): Promise<ProposeTxResult> {
  const { jobId, freelancerId, recruiterId, statedRateUsd, durationWeeks, proposedBy } = args;
  try {
    const created = await prisma.engagement.create({
      data: {
        jobId,
        freelancerId,
        recruiterId,
        statedRateUsd,
        durationWeeks,
        freelancerConfirmed: proposedBy === "FREELANCER",
        recruiterConfirmed: proposedBy === "RECRUITER",
      },
      select: { id: true },
    });
    return { ok: true, engagementId: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "already-exists" };
    }
    throw error;
  }
}

export type ConfirmTxResult =
  | { ok: true; recruiterId: string }
  | {
      ok: false;
      reason: "not-found" | "not-pending" | "already-confirmed" | "terms-changed";
    };

/**
 * Records the answering side's confirmation, which by definition completes the
 * pair — the proposer is already confirmed, and a row nobody proposed is
 * refused below. So an `ok` result always means "this engagement just became
 * mutually confirmed", and the caller runs the TRUSTED promotion exactly once.
 *
 * The row lock is load-bearing. Without it, two writers touching the same
 * engagement each read the other side's boolean as it was before the other's
 * write under READ COMMITTED, and both decide on stale state.
 */
export async function confirmEngagementTx(args: {
  engagementId: string;
  side: EngagementSide;
  /**
   * The figures the confirming party was actually shown. Compared under the
   * lock, because the proposer may amend the terms right up until this write:
   * without it, an amend landing between the counterparty's page render and
   * their click is absorbed silently, and they go on record as having
   * confirmed a rate and duration they never saw.
   */
  expectedRateUsd: number;
  expectedDurationWeeks: number;
}): Promise<ConfirmTxResult> {
  const { engagementId, side, expectedRateUsd, expectedDurationWeeks } = args;
  if (!isPlausibleId(engagementId)) return { ok: false, reason: "not-found" };

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Engagement" WHERE "id" = ${engagementId} FOR UPDATE`;

    const row = await tx.engagement.findUnique({
      where: { id: engagementId },
      select: {
        recruiterId: true,
        freelancerConfirmed: true,
        recruiterConfirmed: true,
        declinedAt: true,
        statedRateUsd: true,
        durationWeeks: true,
      },
    });
    if (!row) return { ok: false, reason: "not-found" } as const;
    if (row.declinedAt) return { ok: false, reason: "not-pending" } as const;

    const mine = side === "FREELANCER" ? row.freelancerConfirmed : row.recruiterConfirmed;
    const theirs = side === "FREELANCER" ? row.recruiterConfirmed : row.freelancerConfirmed;
    if (mine) return { ok: false, reason: "already-confirmed" } as const;
    // Nobody proposed this, so there is nothing to answer.
    if (!theirs) return { ok: false, reason: "not-pending" } as const;

    // Read INSIDE the lock, so an amend committed after the page render — or
    // racing this very request — is caught rather than silently confirmed.
    if (row.statedRateUsd !== expectedRateUsd || row.durationWeeks !== expectedDurationWeeks) {
      return { ok: false, reason: "terms-changed" } as const;
    }

    await tx.engagement.update({
      where: { id: engagementId },
      data:
        side === "FREELANCER" ? { freelancerConfirmed: true } : { recruiterConfirmed: true },
      // isConfirmed and confirmedAt are set by engagement_sync_confirmation_trg,
      // never written here — the trigger is what makes them underivable by hand.
      select: { id: true },
    });

    return { ok: true, recruiterId: row.recruiterId } as const;
  });
}

export type DeclineTxResult = { ok: true } | { ok: false; reason: "not-found" | "not-pending" };

/**
 * The counterparty's refusal. Conditional on the row still being pending and
 * undeclined, so it cannot overwrite a confirmation that landed first.
 */
export async function declineEngagementTx(args: {
  engagementId: string;
  side: EngagementSide;
}): Promise<DeclineTxResult> {
  const { engagementId, side } = args;
  if (!isPlausibleId(engagementId)) return { ok: false, reason: "not-found" };

  const declined = await prisma.engagement.updateMany({
    where: {
      id: engagementId,
      isConfirmed: false,
      declinedAt: null,
      // Only the side that did NOT propose may decline: their own boolean must
      // still be false, and the other side's must be true.
      ...(side === "FREELANCER"
        ? { freelancerConfirmed: false, recruiterConfirmed: true }
        : { recruiterConfirmed: false, freelancerConfirmed: true }),
    },
    data: { declinedAt: new Date() },
  });
  return declined.count > 0 ? { ok: true } : { ok: false, reason: "not-pending" };
}

export type AmendTxResult = { ok: true } | { ok: false; reason: "not-found" | "not-pending" };

/**
 * Lets the proposer correct the stated terms while the other side is still
 * undecided — otherwise a typo'd rate is permanent, and the unique constraint
 * means it can never be re-proposed either.
 */
export async function amendEngagementTermsTx(args: {
  engagementId: string;
  side: EngagementSide;
  statedRateUsd: number;
  durationWeeks: number;
}): Promise<AmendTxResult> {
  const { engagementId, side, statedRateUsd, durationWeeks } = args;
  if (!isPlausibleId(engagementId)) return { ok: false, reason: "not-found" };

  const amended = await prisma.engagement.updateMany({
    where: {
      id: engagementId,
      isConfirmed: false,
      declinedAt: null,
      // The proposer is the side already confirmed; the other must still be open.
      ...(side === "FREELANCER"
        ? { freelancerConfirmed: true, recruiterConfirmed: false }
        : { recruiterConfirmed: true, freelancerConfirmed: false }),
    },
    data: { statedRateUsd, durationWeeks },
  });
  return amended.count > 0 ? { ok: true } : { ok: false, reason: "not-pending" };
}

export type CreateReviewTxResult =
  | { ok: true; reviewId: string }
  | { ok: false; reason: "already-reviewed" | "not-confirmed" };

/**
 * Writes one review. Author and subject are passed as resolved ids by the
 * service, which derives them from the caller's side of the engagement — this
 * function never reads them off client input.
 *
 * engagementIsConfirmed is left at its default of true so the composite FK has
 * to find a CONFIRMED engagement to point at. An unconfirmed one has no
 * matching row and Postgres rejects the insert (P2003), which is the rule
 * holding even if every check above this line were removed.
 */
export async function createReviewTx(args: {
  engagementId: string;
  side: EngagementSide;
  authorProfileId: string;
  subjectProfileId: string;
  rating: number;
  body: string;
}): Promise<CreateReviewTxResult> {
  const { engagementId, side, authorProfileId, subjectProfileId, rating, body } = args;

  try {
    const review = await prisma.review.create({
      data: {
        engagementId,
        rating,
        body,
        // A freelancer reviews the recruiter; a recruiter reviews the
        // freelancer. review_author_and_subject_are_opposite_sides rejects any
        // other pairing at the database.
        authorFreelancerId: side === "FREELANCER" ? authorProfileId : null,
        authorRecruiterId: side === "RECRUITER" ? authorProfileId : null,
        subjectRecruiterId: side === "FREELANCER" ? subjectProfileId : null,
        subjectFreelancerId: side === "RECRUITER" ? subjectProfileId : null,
      },
      select: { id: true },
    });
    return { ok: true, reviewId: review.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // One review per party per engagement.
      if (error.code === "P2002") return { ok: false, reason: "already-reviewed" };
      // The composite FK found no confirmed engagement to point at.
      if (error.code === "P2003") return { ok: false, reason: "not-confirmed" };
    }
    throw error;
  }
}
