import { randomUUID } from "node:crypto";

import { prisma } from "./client";

/**
 * Anonymising an account, in one transaction.
 *
 * Nothing here deletes a row. The schema's own note on `deactivatedAt` sets
 * the rule and it applies twice over to deletion: applications, engagements
 * and reviews are SHARED history, and removing them rewrites somebody else's
 * record — a recruiter loses the evidence behind a hire, a review loses the
 * person it was about, a confirmed engagement loses half of what made it
 * mutual.
 *
 * So the person is erased and the record is kept. What survives is a
 * placeholder with no name, no contact details and no links, still attached to
 * the history it took part in.
 *
 * The email is replaced rather than nulled: it is UNIQUE and NOT NULL, and the
 * replacement points at `.invalid`, a domain reserved by RFC 2606 precisely so
 * it can never route anywhere.
 */

export type DeletionSummary = {
  /** What their public page said, for the confirmation screen. */
  wasNamed: string;
  hadSubscription: string | null;
};

export async function anonymiseAccount(userId: string): Promise<DeletionSummary> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        freelancer: { select: { id: true, displayName: true } },
        recruiter: { select: { id: true, companyName: true } },
        subscription: { select: { stripeSubscriptionId: true } },
      },
    });

    const wasNamed =
      user.freelancer?.displayName ?? user.recruiter?.companyName ?? "this account";

    // Unroutable by construction, and unique.
    const scrubbedEmail = `deleted-${randomUUID()}@deleted.talent4u.invalid`;

    await tx.user.update({
      where: { id: userId },
      data: {
        email: scrubbedEmail,
        deletedAt: new Date(),
        // Nothing should ever mail this address, but belt and braces: the
        // digest selects on this flag, and it now points at nowhere.
        jobDigestOptIn: false,
        unsubscribeToken: null,
      },
    });

    if (user.freelancer) {
      await tx.freelancerProfile.update({
        where: { id: user.freelancer.id },
        data: {
          displayName: "Deleted account",
          headline: "This account has been deleted",
          bio: "This person deleted their Talent4u account. Their applications and any engagements they confirmed remain, because those are shared with the people on the other side of them.",
          avatarUrl: null,
          githubUrl: null,
          portfolioUrl: null,
          linkedinUrl: null,
          hourlyRateUsd: null,
          isOpenToWork: false,
          // Off every public surface, and out of candidate search.
          deactivatedAt: new Date(),
          verification: "NONE",
          verificationSubmittedAt: null,
          verificationNote: null,
          searchBoost: false,
        },
      });
      // Skills describe a person who is gone, and they are what search matches.
      await tx.skillOnFreelancer.deleteMany({ where: { freelancerId: user.freelancer.id } });
    }

    if (user.recruiter) {
      await tx.recruiterProfile.update({
        where: { id: user.recruiter.id },
        data: {
          companyName: "Deleted company",
          description: null,
          companyDomain: null,
          registrationNo: null,
          linkedinUrl: null,
          websiteUrl: null,
          logoUrl: null,
          deactivatedAt: new Date(),
          verificationSubmittedAt: null,
          verificationNote: null,
        },
      });
      // Their open roles come down. A closed role stays as it is: it is part
      // of an application's history for whoever applied to it.
      await tx.job.updateMany({
        where: { recruiterId: user.recruiter.id, status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    }

    return {
      wasNamed,
      hadSubscription: user.subscription?.stripeSubscriptionId ?? null,
    };
  });
}

/** Whether this account has already been deleted. */
export async function isDeleted(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true },
  });
  return row?.deletedAt != null;
}
