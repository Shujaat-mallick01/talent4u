import type { RecruiterTier } from "@/lib/generated/prisma/enums";

import { prisma } from "./client";

/**
 * Prisma access for recruiter verification and tier promotion.
 *
 * Every tier write goes through setRecruiterTier, which fans the new tier out
 * to the denormalized Job.recruiterTier in the SAME transaction — the
 * obligation recorded on that column in schema.prisma. Miss the fan-out and
 * the browse ?tier= filter silently goes stale.
 */

/** Jobs whose denormalized tier must track the profile's tier. */
const FANOUT_JOB_STATUSES = ["ACTIVE", "PENDING_REVIEW", "CLOSED", "DRAFT"] as const;

export async function setRecruiterTier(args: {
  recruiterId: string;
  tier: RecruiterTier;
  verifiedAt?: Date | null;
  verificationSubmittedAt?: Date | null;
  verificationNote?: string | null;
}): Promise<void> {
  const { recruiterId, tier, ...rest } = args;
  await prisma.$transaction(async (tx) => {
    await tx.recruiterProfile.update({
      where: { id: recruiterId },
      data: {
        tier,
        ...("verifiedAt" in rest ? { verifiedAt: rest.verifiedAt } : {}),
        ...("verificationSubmittedAt" in rest
          ? { verificationSubmittedAt: rest.verificationSubmittedAt }
          : {}),
        ...("verificationNote" in rest ? { verificationNote: rest.verificationNote } : {}),
      },
    });
    await tx.job.updateMany({
      where: { recruiterId, status: { in: [...FANOUT_JOB_STATUSES] } },
      data: { recruiterTier: tier },
    });
  });
}

/**
 * Edits the three VERIFIED evidence fields and takes any pending submission
 * back out of the queue, so a reviewer never judges stale evidence. Touches
 * no tier column, so the Job.recruiterTier fan-out does not apply.
 */
export async function updateVerificationDetails(
  recruiterId: string,
  data: {
    companyDomain: string | null;
    registrationNo: string | null;
    linkedinUrl: string | null;
  },
): Promise<void> {
  await prisma.recruiterProfile.update({
    where: { id: recruiterId },
    data: { ...data, verificationSubmittedAt: null },
  });
}

/** Records a verification submission without touching the tier. */
export async function markVerificationSubmitted(recruiterId: string): Promise<void> {
  await prisma.recruiterProfile.update({
    where: { id: recruiterId },
    data: { verificationSubmittedAt: new Date(), verificationNote: null },
  });
}

/**
 * Stores an admin's rejection: out of the queue, reason kept, tier untouched
 * (it stays UNVERIFIED), so no job rows are rewritten.
 */
export async function recordVerificationRejection(
  recruiterId: string,
  note: string,
): Promise<void> {
  await prisma.recruiterProfile.update({
    where: { id: recruiterId },
    data: { verificationSubmittedAt: null, verificationNote: note },
  });
}

/**
 * How many DISTINCT freelancers this recruiter has mutually confirmed
 * engagements with — the TRUSTED counter. Distinct is load-bearing: without
 * it, one accomplice could confirm three engagements and mint the badge.
 */
export async function countDistinctConfirmedFreelancers(recruiterId: string): Promise<number> {
  const rows = await prisma.engagement.findMany({
    where: { recruiterId, isConfirmed: true },
    distinct: ["freelancerId"],
    select: { freelancerId: true },
  });
  return rows.length;
}

/** The verification-relevant view of a recruiter profile, plus tier only. */
export async function getRecruiterTierAndFlags(recruiterId: string) {
  return prisma.recruiterProfile.findUnique({
    where: { id: recruiterId },
    select: {
      tier: true,
      isBanned: true,
      verificationSubmittedAt: true,
      companyDomain: true,
      registrationNo: true,
      linkedinUrl: true,
      user: { select: { email: true, emailVerified: true } },
    },
  });
}

/** The verification-relevant view of a recruiter profile. */
export async function getVerificationStateForUser(userId: string) {
  return prisma.recruiterProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      companyName: true,
      companyDomain: true,
      registrationNo: true,
      linkedinUrl: true,
      websiteUrl: true,
      tier: true,
      verifiedAt: true,
      verificationSubmittedAt: true,
      verificationNote: true,
      isBanned: true,
      user: { select: { emailVerified: true } },
    },
  });
}

/** Pending submissions, oldest first — the admin queue (Session 4.3). */
export async function listPendingVerifications() {
  return prisma.recruiterProfile.findMany({
    where: { tier: "UNVERIFIED", verificationSubmittedAt: { not: null }, isBanned: false },
    orderBy: { verificationSubmittedAt: "asc" },
    select: {
      id: true,
      slug: true,
      companyName: true,
      companyDomain: true,
      registrationNo: true,
      linkedinUrl: true,
      websiteUrl: true,
      country: true,
      verificationSubmittedAt: true,
      user: { select: { email: true } },
    },
  });
}

/**
 * Tier plus ban state. isBanned travels with the tier because every caller
 * that acts on a tier must also refuse to act on a removed employer, and a
 * function returning the tier alone makes that easy to forget.
 */
export async function getRecruiterTier(
  recruiterId: string,
): Promise<{ tier: RecruiterTier; isBanned: boolean } | null> {
  return prisma.recruiterProfile.findUnique({
    where: { id: recruiterId },
    select: { tier: true, isBanned: true },
  });
}
