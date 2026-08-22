import { isPlausibleId } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * Prisma access for the freelancer verification queue.
 *
 * What this module deliberately CANNOT do: write `verification` or
 * `verifiedAt`. There is no function here that touches either column, which is
 * the structural half of this sprint's rule — reviewing work links must never
 * move the badge, because the badge levels both claim a government ID we have
 * no provider for yet. The database agrees: constraints.sql pins
 * (`verification` = 'NONE') = (`verifiedAt` IS NULL), so a level without a
 * timestamp is rejected outright and a timestamp without an ID check would be
 * a lie in a column.
 *
 * What is left is the queue itself: verificationSubmittedAt (in or out) and
 * verificationNote (the decision record, see lib/validations/
 * freelancer-verification.ts for the marker).
 */

/** Everything the freelancer's own verification page and submit path read. */
export async function getFreelancerVerificationStateForUser(userId: string) {
  return prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      slug: true,
      displayName: true,
      verification: true,
      githubUrl: true,
      portfolioUrl: true,
      linkedinUrl: true,
      verificationSubmittedAt: true,
      verificationNote: true,
      verifiedAt: true,
      deactivatedAt: true,
    },
  });
}

export type FreelancerVerificationState = NonNullable<
  Awaited<ReturnType<typeof getFreelancerVerificationStateForUser>>
>;

/** The same view by profile id — what an admin decision re-checks against. */
export async function getFreelancerVerificationById(freelancerId: string) {
  if (!isPlausibleId(freelancerId)) return null;
  return prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
    select: {
      id: true,
      slug: true,
      displayName: true,
      verification: true,
      githubUrl: true,
      portfolioUrl: true,
      linkedinUrl: true,
      verificationSubmittedAt: true,
      verificationNote: true,
      deactivatedAt: true,
    },
  });
}

/**
 * Puts a profile in the queue. Clears any previous note: a resubmission is a
 * fresh case, and leaving the last reviewer's objection on screen while the
 * fix is already in the queue reads as though nothing happened.
 */
export async function markFreelancerVerificationSubmitted(freelancerId: string): Promise<void> {
  await prisma.freelancerProfile.update({
    where: { id: freelancerId },
    data: { verificationSubmittedAt: new Date(), verificationNote: null },
  });
}

/**
 * Records an admin decision: out of the queue, note kept. One writer for both
 * outcomes — an approval stores the canonical marker, a rejection stores the
 * reason — because both are the same transition and splitting them would give
 * two places to forget to clear verificationSubmittedAt.
 *
 * Conditional on the profile still being IN the queue, so two admins deciding
 * the same submission at once do not both succeed and overwrite each other's
 * note; the loser gets `false` and the caller reports it as no longer pending.
 */
export async function claimFreelancerVerificationDecision(
  freelancerId: string,
  note: string,
  /**
   * The submission timestamp the admin actually had on screen. The claim is
   * conditional on it, so a submission withdrawn-and-refiled between the queue
   * loading and the click — possibly with different links — is NOT decided by
   * a review of the old ones. Same seen-terms rule the engagement confirm
   * uses: an approval is of a specific submission, not of a queue slot.
   */
  seenSubmittedAt: Date,
): Promise<boolean> {
  if (!isPlausibleId(freelancerId)) return false;
  const claimed = await prisma.freelancerProfile.updateMany({
    where: { id: freelancerId, verificationSubmittedAt: seenSubmittedAt },
    data: { verificationSubmittedAt: null, verificationNote: note },
  });
  return claimed.count > 0;
}

/**
 * Pending submissions, oldest first — the admin queue.
 *
 * Filtered to the set that is actually reviewable: still on NONE (once ID
 * verification ships, a profile that already moved is a different decision),
 * and still live, since reviewing the links of a profile nobody can see
 * decides nothing.
 */
export async function listPendingFreelancerVerifications() {
  return prisma.freelancerProfile.findMany({
    where: {
      verification: "NONE",
      verificationSubmittedAt: { not: null },
      deactivatedAt: null,
    },
    orderBy: { verificationSubmittedAt: "asc" },
    select: {
      id: true,
      slug: true,
      displayName: true,
      headline: true,
      country: true,
      githubUrl: true,
      portfolioUrl: true,
      linkedinUrl: true,
      verificationSubmittedAt: true,
      user: { select: { email: true } },
    },
  });
}
