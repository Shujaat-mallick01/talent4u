import { isPlausibleId } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * The reads that answer "who should hear about this, and what do they need to
 * be told".
 *
 * Kept apart from the feature queries because notification lookups have a
 * different shape: they run AFTER the response, they always need the account
 * email (which no feature query selects, since no page renders it), and every
 * one of them returns null rather than throwing when a row has gone — a
 * notification for something that no longer exists is a no-op, not an error.
 */

/** Everything either side of an application needs to be told about it. */
export async function getApplicationNotificationTargets(applicationId: string) {
  if (!isPlausibleId(applicationId)) return null;

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      coverLetter: true,
      proposedRateUsd: true,
      freelancer: {
        select: { displayName: true, headline: true, user: { select: { email: true } } },
      },
      job: {
        select: {
          id: true,
          slug: true,
          title: true,
          recruiter: {
            select: { companyName: true, isBanned: true, user: { select: { email: true } } },
          },
        },
      },
    },
  });
  if (!application) return null;

  // A removed employer is not mailed about anything.
  if (application.job.recruiter.isBanned) return null;

  return {
    coverLetter: application.coverLetter,
    proposedRateUsd: application.proposedRateUsd,
    freelancerEmail: application.freelancer.user.email,
    freelancerName: application.freelancer.displayName,
    freelancerHeadline: application.freelancer.headline,
    recruiterEmail: application.job.recruiter.user.email,
    companyName: application.job.recruiter.companyName,
    jobId: application.job.id,
    jobSlug: application.job.slug,
    jobTitle: application.job.title,
  };
}

/** Who to tell about a new message, and what to call the sender. */
export async function getConversationNotificationTargets(
  conversationId: string,
  senderUserId: string,
) {
  if (!isPlausibleId(conversationId)) return null;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      job: { select: { title: true } },
      participants: {
        select: {
          userId: true,
          user: {
            select: {
              email: true,
              freelancer: { select: { displayName: true } },
              recruiter: { select: { companyName: true, isBanned: true } },
            },
          },
        },
      },
    },
  });
  if (!conversation) return null;

  const sender = conversation.participants.find((p) => p.userId === senderUserId);
  if (!sender) return null;

  const displayName = (p: (typeof conversation.participants)[number]) =>
    p.user.recruiter?.companyName ?? p.user.freelancer?.displayName ?? "Someone";

  return {
    jobTitle: conversation.job?.title ?? null,
    senderName: displayName(sender),
    recipients: conversation.participants
      .filter((p) => p.userId !== senderUserId)
      // A removed employer stops receiving mail as well as sending it.
      .filter((p) => !p.user.recruiter?.isBanned)
      .map((p) => ({ email: p.user.email, name: displayName(p) })),
  };
}

/**
 * The counterparty on an engagement, and where their copy of it lives.
 *
 * `actorUserId` is whoever just did something; "the other" is who hears about
 * it. The dashboard path differs by role, so it is resolved here rather than
 * guessed by the caller.
 */
export async function getEngagementNotificationTargets(
  engagementId: string,
  actorUserId: string,
) {
  if (!isPlausibleId(engagementId)) return null;

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      statedRateUsd: true,
      durationWeeks: true,
      job: { select: { title: true } },
      freelancer: { select: { displayName: true, userId: true, user: { select: { email: true } } } },
      recruiter: {
        select: {
          companyName: true,
          userId: true,
          isBanned: true,
          user: { select: { email: true } },
        },
      },
    },
  });
  if (!engagement) return null;
  if (engagement.recruiter.isBanned) return null;

  const actorIsFreelancer = engagement.freelancer.userId === actorUserId;
  const actorIsRecruiter = engagement.recruiter.userId === actorUserId;
  if (!actorIsFreelancer && !actorIsRecruiter) return null;

  return {
    statedRateUsd: engagement.statedRateUsd,
    durationWeeks: engagement.durationWeeks,
    jobTitle: engagement.job?.title ?? null,
    proposerName: actorIsFreelancer
      ? engagement.freelancer.displayName
      : engagement.recruiter.companyName,
    otherEmail: actorIsFreelancer
      ? engagement.recruiter.user.email
      : engagement.freelancer.user.email,
    otherDashboardPath: actorIsFreelancer
      ? "/dashboard/recruiter/engagements"
      : "/dashboard/freelancer/engagements",
  };
}

/** The account behind a recruiter profile. */
export async function getRecruiterAccountEmail(recruiterId: string) {
  if (!isPlausibleId(recruiterId)) return null;
  const recruiter = await prisma.recruiterProfile.findUnique({
    where: { id: recruiterId },
    select: { companyName: true, isBanned: true, user: { select: { email: true } } },
  });
  if (!recruiter || recruiter.isBanned) return null;
  return { email: recruiter.user.email, companyName: recruiter.companyName };
}

/** The account that owns a job. */
export async function getJobOwnerEmail(jobId: string) {
  if (!isPlausibleId(jobId)) return null;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      title: true,
      slug: true,
      recruiter: { select: { isBanned: true, user: { select: { email: true } } } },
    },
  });
  if (!job || job.recruiter.isBanned) return null;
  return { email: job.recruiter.user.email, jobTitle: job.title, jobSlug: job.slug };
}

/** The account behind a freelancer profile. */
export async function getFreelancerAccountEmail(freelancerId: string) {
  if (!isPlausibleId(freelancerId)) return null;
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
    select: { displayName: true, user: { select: { email: true } } },
  });
  if (!freelancer) return null;
  return { email: freelancer.user.email, displayName: freelancer.displayName };
}
