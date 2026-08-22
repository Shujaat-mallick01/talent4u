import { after } from "next/server";

import {
  notifyApplicationDecision,
  notifyEngagementConfirmed,
  notifyEngagementProposed,
  notifyJobHeld,
  notifyJobPublished,
  notifyNewApplication,
  notifyNewMessage,
  notifyVerificationDecision,
  notifyWorkLinksReviewed,
} from "@/lib/email/notifications";
import {
  getApplicationNotificationTargets,
  getConversationNotificationTargets,
  getEngagementNotificationTargets,
  getFreelancerAccountEmail,
  getJobOwnerEmail,
  getRecruiterAccountEmail,
} from "@/lib/db/notifications";

/**
 * The bridge between "something happened" and "somebody was told".
 *
 * Two properties every function here holds:
 *
 * 1. It never throws. A mail outage, a bad address, a Resend 500 — none of it
 *    may fail an application, a message, or a moderation decision. The user's
 *    actual work has already been committed by the time any of this runs.
 *
 * 2. It runs AFTER the response. Next's after() defers the work until the
 *    request has been answered, so a 400ms mail round trip never sits in front
 *    of the redirect a user is waiting on.
 *
 * Which means: if mail breaks, the product keeps working and the logs say so.
 * That is the correct trade for a notification.
 */

/**
 * Runs work after the response, swallowing anything it throws.
 *
 * after() only exists inside a request, and these services are also called
 * from verification scripts and unit tests where there is no request to be
 * after. Rather than making every caller care, this degrades: scheduled when
 * it can be, run detached when it cannot, silent either way.
 */
function fireAndForget(label: string, work: () => Promise<unknown>): void {
  const guarded = async () => {
    try {
      await work();
    } catch (error: unknown) {
      console.error(`[notify] ${label}:`, error instanceof Error ? error.message : error);
    }
  };

  try {
    after(guarded);
  } catch {
    // No request scope. Do not schedule anything: a detached promise here
    // would outlive a script's own prisma disconnect and log a confusing
    // failure that has nothing to do with the caller.
  }
}

/** First N characters of a body, for an email excerpt. */
const excerpt = (text: string, max = 400): string =>
  text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;

// ── Applications ───────────────────────────────────────────────────────────

export function onApplicationSubmitted(applicationId: string): void {
  fireAndForget("new-application", async () => {
    const t = await getApplicationNotificationTargets(applicationId);
    if (!t) return;
    await notifyNewApplication({
      to: t.recruiterEmail,
      companyName: t.companyName,
      jobTitle: t.jobTitle,
      jobId: t.jobId,
      freelancerName: t.freelancerName,
      freelancerHeadline: t.freelancerHeadline,
      proposedRateUsd: t.proposedRateUsd,
      coverLetterExcerpt: excerpt(t.coverLetter),
    });
  });
}

export function onApplicationDecided(
  applicationId: string,
  decision: "SHORTLISTED" | "REJECTED",
): void {
  fireAndForget(`application-${decision}`, async () => {
    const t = await getApplicationNotificationTargets(applicationId);
    if (!t) return;
    await notifyApplicationDecision({
      to: t.freelancerEmail,
      freelancerName: t.freelancerName,
      jobTitle: t.jobTitle,
      jobSlug: t.jobSlug,
      companyName: t.companyName,
      decision,
    });
  });
}

// ── Messages ───────────────────────────────────────────────────────────────

export function onMessageSent(conversationId: string, senderUserId: string, body: string): void {
  fireAndForget("new-message", async () => {
    const t = await getConversationNotificationTargets(conversationId, senderUserId);
    if (!t) return;
    // Everyone in the thread who is not the sender. Today that is one person;
    // written as a loop so team seats do not silently notify nobody.
    await Promise.all(
      t.recipients.map((r) =>
        notifyNewMessage({
          to: r.email,
          senderName: t.senderName,
          jobTitle: t.jobTitle,
          conversationId,
          excerpt: excerpt(body),
        }),
      ),
    );
  });
}

// ── Engagements ────────────────────────────────────────────────────────────

export function onEngagementProposed(engagementId: string, proposerUserId: string): void {
  fireAndForget("engagement-proposed", async () => {
    const t = await getEngagementNotificationTargets(engagementId, proposerUserId);
    if (!t || t.statedRateUsd === null || t.durationWeeks === null) return;
    await notifyEngagementProposed({
      to: t.otherEmail,
      proposerName: t.proposerName,
      jobTitle: t.jobTitle,
      statedRateUsd: t.statedRateUsd,
      durationWeeks: t.durationWeeks,
      dashboardPath: t.otherDashboardPath,
    });
  });
}

export function onEngagementConfirmed(engagementId: string, confirmerUserId: string): void {
  fireAndForget("engagement-confirmed", async () => {
    const t = await getEngagementNotificationTargets(engagementId, confirmerUserId);
    if (!t) return;
    // The person who filed it is the one waiting to hear.
    await notifyEngagementConfirmed({
      to: t.otherEmail,
      otherName: t.proposerName,
      dashboardPath: t.otherDashboardPath,
    });
  });
}

// ── Verification and moderation ────────────────────────────────────────────

export function onVerificationDecided(
  recruiterId: string,
  approved: boolean,
  note?: string | null,
): void {
  fireAndForget("verification-decision", async () => {
    const t = await getRecruiterAccountEmail(recruiterId);
    if (!t) return;
    await notifyVerificationDecision({
      to: t.email,
      companyName: t.companyName,
      approved,
      note,
    });
  });
}

export function onJobHeld(jobId: string): void {
  fireAndForget("job-held", async () => {
    const t = await getJobOwnerEmail(jobId);
    if (!t) return;
    await notifyJobHeld({ to: t.email, jobTitle: t.jobTitle });
  });
}

export function onJobPublishedAfterReview(jobId: string): void {
  fireAndForget("job-published", async () => {
    const t = await getJobOwnerEmail(jobId);
    if (!t) return;
    await notifyJobPublished({ to: t.email, jobTitle: t.jobTitle, jobSlug: t.jobSlug });
  });
}

export function onWorkLinksReviewed(
  freelancerId: string,
  approved: boolean,
  note?: string | null,
): void {
  fireAndForget("work-links-reviewed", async () => {
    const t = await getFreelancerAccountEmail(freelancerId);
    if (!t) return;
    await notifyWorkLinksReviewed({
      to: t.email,
      displayName: t.displayName,
      approved,
      note,
    });
  });
}
