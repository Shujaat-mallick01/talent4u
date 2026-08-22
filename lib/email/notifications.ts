import { sendEmail, type SendResult } from "./client";
import { button, emailLayout, escapeHtml, facts, paragraph, quote, textEmail, url } from "./layout";

/**
 * Every email the product sends, and why.
 *
 * All of these are strictly TRANSACTIONAL: each one is about something that
 * just happened to the recipient's own account, triggered by another person's
 * action, and each says so in its footer. None is marketing, none is a digest,
 * and nothing here mails anyone who has not taken part in the thing being
 * reported. That distinction is why there is no unsubscribe link yet — and
 * also why the moment a digest or a "jobs you might like" email is added, it
 * needs a preference column and a settings page first.
 *
 * Sending is best-effort by construction: notify() never throws, so a mail
 * outage can slow a request but can never fail an application, a message, or
 * a moderation decision. The caller does not await a result it can act on.
 */

export type NotifyOutcome = SendResult & { event: string };

async function deliver(args: {
  event: string;
  to: string;
  subject: string;
  heading: string;
  preheader: string;
  reason: string;
  bodyHtml: string;
  textLines: string[];
  action?: { label: string; href: string };
}): Promise<NotifyOutcome> {
  const { event, to, subject, heading, preheader, reason, bodyHtml, textLines, action } = args;

  const html = emailLayout({
    heading,
    preheader,
    reason,
    body: bodyHtml + (action ? button(action.label, action.href) : ""),
  });

  const result = await sendEmail({
    to,
    subject,
    html,
    text: textEmail({ heading, lines: textLines, action, reason }),
  });

  if (!result.ok) {
    // Logged, never thrown. A mail failure is an operational problem, not a
    // reason to lose the user's actual work.
    console.error(`[email] ${event} to ${to} failed: ${result.error}`);
  }
  return { ...result, event };
}

// ── Applications ───────────────────────────────────────────────────────────

/** A company just received an application. */
export function notifyNewApplication(args: {
  to: string;
  companyName: string;
  jobTitle: string;
  jobId: string;
  freelancerName: string;
  freelancerHeadline: string;
  proposedRateUsd: number | null;
  coverLetterExcerpt: string;
}): Promise<NotifyOutcome> {
  const href = url(`/dashboard/recruiter/jobs/${args.jobId}/applications`);
  return deliver({
    event: "new-application",
    to: args.to,
    subject: `${args.freelancerName} applied to ${args.jobTitle}`,
    heading: `${args.freelancerName} applied`,
    preheader: `${args.freelancerHeadline} — for ${args.jobTitle}`,
    reason: `You are receiving this because you posted ${args.jobTitle} on Talent4u.`,
    bodyHtml:
      paragraph(
        `<strong style="color:#0E0E10;">${escapeHtml(args.freelancerName)}</strong> applied to <strong style="color:#0E0E10;">${escapeHtml(args.jobTitle)}</strong>.`,
      ) +
      facts([
        ["Headline", args.freelancerHeadline],
        ...(args.proposedRateUsd !== null
          ? ([["Proposed rate", `$${args.proposedRateUsd.toLocaleString("en-US")}`]] as [
              string,
              string,
            ][])
          : []),
      ]) +
      quote(args.coverLetterExcerpt),
    textLines: [
      `${args.freelancerName} — ${args.freelancerHeadline}`,
      ...(args.proposedRateUsd !== null ? [`Proposed rate: $${args.proposedRateUsd}`] : []),
      "",
      args.coverLetterExcerpt,
    ],
    action: { label: "Read the application", href },
  });
}

/** A freelancer's application was shortlisted or turned down. */
export function notifyApplicationDecision(args: {
  to: string;
  freelancerName: string;
  jobTitle: string;
  jobSlug: string;
  companyName: string;
  decision: "SHORTLISTED" | "REJECTED";
}): Promise<NotifyOutcome> {
  const shortlisted = args.decision === "SHORTLISTED";
  return deliver({
    event: `application-${args.decision.toLowerCase()}`,
    to: args.to,
    subject: shortlisted
      ? `${args.companyName} shortlisted you for ${args.jobTitle}`
      : `${args.companyName} went another way on ${args.jobTitle}`,
    heading: shortlisted ? "You have been shortlisted" : "Not this one",
    preheader: `${args.jobTitle} at ${args.companyName}`,
    reason: `You are receiving this because you applied to ${args.jobTitle} on Talent4u.`,
    bodyHtml: shortlisted
      ? paragraph(
          `<strong style="color:#0E0E10;">${escapeHtml(args.companyName)}</strong> shortlisted you for <strong style="color:#0E0E10;">${escapeHtml(args.jobTitle)}</strong>. They may message you next — and you can write to them first if you would rather not wait.`,
        )
      : paragraph(
          `<strong style="color:#0E0E10;">${escapeHtml(args.companyName)}</strong> is not moving forward with your application for <strong style="color:#0E0E10;">${escapeHtml(args.jobTitle)}</strong>. Nothing about it counts against you here, and the slot it used frees up 30 days after you applied.`,
        ),
    textLines: shortlisted
      ? [`${args.companyName} shortlisted you for ${args.jobTitle}.`]
      : [
          `${args.companyName} is not moving forward on ${args.jobTitle}.`,
          "The application slot frees up 30 days after you applied.",
        ],
    action: shortlisted
      ? { label: "Open your messages", href: url("/dashboard/messages") }
      : { label: "Browse open jobs", href: url("/jobs") },
  });
}

// ── Messages ───────────────────────────────────────────────────────────────

export function notifyNewMessage(args: {
  to: string;
  senderName: string;
  jobTitle: string | null;
  conversationId: string;
  excerpt: string;
}): Promise<NotifyOutcome> {
  return deliver({
    event: "new-message",
    to: args.to,
    subject: `${args.senderName} sent you a message`,
    heading: `${args.senderName} wrote to you`,
    preheader: args.excerpt.slice(0, 120),
    reason: "You are receiving this because you are part of this conversation on Talent4u.",
    bodyHtml:
      (args.jobTitle
        ? paragraph(`About <strong style="color:#0E0E10;">${escapeHtml(args.jobTitle)}</strong>.`)
        : "") + quote(args.excerpt),
    textLines: [...(args.jobTitle ? [`About: ${args.jobTitle}`, ""] : []), args.excerpt],
    action: { label: "Reply", href: url(`/dashboard/messages/${args.conversationId}`) },
  });
}

// ── Engagements ────────────────────────────────────────────────────────────

/** Someone filed a claim that the two of you worked together. */
export function notifyEngagementProposed(args: {
  to: string;
  proposerName: string;
  jobTitle: string | null;
  statedRateUsd: number;
  durationWeeks: number;
  dashboardPath: string;
}): Promise<NotifyOutcome> {
  return deliver({
    event: "engagement-proposed",
    to: args.to,
    subject: `${args.proposerName} says you worked together — confirm or decline`,
    heading: `${args.proposerName} recorded an engagement`,
    preheader: `$${args.statedRateUsd.toLocaleString("en-US")} · ${args.durationWeeks} weeks — waiting on you`,
    reason: `You are receiving this because ${args.proposerName} named you in an engagement on Talent4u.`,
    bodyHtml:
      paragraph(
        `<strong style="color:#0E0E10;">${escapeHtml(args.proposerName)}</strong> says the two of you worked together on these terms. Nothing is published and no review can be written until you agree to them.`,
      ) +
      facts([
        ...(args.jobTitle ? ([["Job", args.jobTitle]] as [string, string][]) : []),
        ["Stated rate", `$${args.statedRateUsd.toLocaleString("en-US")}`],
        ["Duration", `${args.durationWeeks} ${args.durationWeeks === 1 ? "week" : "weeks"}`],
      ]) +
      paragraph(
        `Confirm only if these figures match what actually happened. If they do not, decline — that is final, and the same claim cannot be filed at you again.`,
      ),
    textLines: [
      `${args.proposerName} says you worked together.`,
      ...(args.jobTitle ? [`Job: ${args.jobTitle}`] : []),
      `Stated rate: $${args.statedRateUsd}`,
      `Duration: ${args.durationWeeks} weeks`,
      "",
      "Nothing publishes until you agree. Confirm only if the figures are right.",
    ],
    action: { label: "Confirm or decline", href: url(args.dashboardPath) },
  });
}

/** Both sides agreed — reviews are open. */
export function notifyEngagementConfirmed(args: {
  to: string;
  otherName: string;
  dashboardPath: string;
}): Promise<NotifyOutcome> {
  return deliver({
    event: "engagement-confirmed",
    to: args.to,
    subject: `${args.otherName} confirmed your engagement`,
    heading: "Confirmed by both sides",
    preheader: "You can each write one review of the other now.",
    reason: "You are receiving this because you are one of the two parties to this engagement.",
    bodyHtml: paragraph(
      `<strong style="color:#0E0E10;">${escapeHtml(args.otherName)}</strong> confirmed the rate and duration. That is what unlocks reviews: you can each write one review of the other, and neither of you could have done it alone.`,
    ),
    textLines: [
      `${args.otherName} confirmed the rate and duration.`,
      "You can each write one review of the other now.",
    ],
    action: { label: "Write your review", href: url(args.dashboardPath) },
  });
}

// ── Verification and moderation ────────────────────────────────────────────

export function notifyVerificationDecision(args: {
  to: string;
  companyName: string;
  approved: boolean;
  note?: string | null;
}): Promise<NotifyOutcome> {
  return deliver({
    event: args.approved ? "verification-approved" : "verification-returned",
    to: args.to,
    subject: args.approved
      ? `${args.companyName} is verified`
      : `${args.companyName} — a bit more needed to verify`,
    heading: args.approved ? "You are verified" : "We need one more thing",
    preheader: args.approved
      ? "Your posts now carry the verified badge."
      : "Your verification submission came back.",
    reason: "You are receiving this because you submitted your company for verification.",
    bodyHtml: args.approved
      ? paragraph(
          `Your posts now carry the verified badge, the one-post cap is lifted, and you can start conversations rather than only replying to them.`,
        )
      : paragraph(
          `We could not verify <strong style="color:#0E0E10;">${escapeHtml(args.companyName)}</strong> from what was submitted.`,
        ) + (args.note ? quote(args.note) : ""),
    textLines: args.approved
      ? [
          "Your posts now carry the verified badge.",
          "The one-post cap is lifted, and you can start conversations.",
        ]
      : ["We could not verify your company from what was submitted.", ...(args.note ? ["", args.note] : [])],
    action: args.approved
      ? { label: "Post a job", href: url("/dashboard/recruiter/jobs/new") }
      : { label: "Update your details", href: url("/dashboard/recruiter/verification") },
  });
}

/** A post was held by the automated scanner before publishing. */
export function notifyJobHeld(args: {
  to: string;
  jobTitle: string;
}): Promise<NotifyOutcome> {
  return deliver({
    event: "job-held",
    to: args.to,
    subject: `${args.jobTitle} is waiting on a human check`,
    heading: "Your post is held for review",
    preheader: "It matched a pattern we check by hand before publishing.",
    reason: `You are receiving this because you tried to publish ${args.jobTitle} on Talent4u.`,
    bodyHtml:
      paragraph(
        `<strong style="color:#0E0E10;">${escapeHtml(args.jobTitle)}</strong> is not live yet. Its wording matches a pattern we check by hand — usually something about payment, fees, or a long unpaid task.`,
      ) +
      paragraph(
        `This is not an accusation. Most held posts publish unchanged; a person reads it and it goes live. We hold rather than publish-then-remove because a scam post that runs for an hour has already done its damage.`,
      ),
    textLines: [
      `${args.jobTitle} is not live yet.`,
      "Its wording matched a pattern we check by hand before publishing.",
      "Most held posts publish unchanged once a person has read them.",
    ],
    action: { label: "See your jobs", href: url("/dashboard/recruiter") },
  });
}

/** A held post was cleared and is now live. */
export function notifyJobPublished(args: {
  to: string;
  jobTitle: string;
  jobSlug: string;
}): Promise<NotifyOutcome> {
  return deliver({
    event: "job-published",
    to: args.to,
    subject: `${args.jobTitle} is live`,
    heading: "Your post is live",
    preheader: "A moderator cleared it. It is now visible on Talent4u.",
    reason: `You are receiving this because you posted ${args.jobTitle} on Talent4u.`,
    bodyHtml: paragraph(
      `A moderator read <strong style="color:#0E0E10;">${escapeHtml(args.jobTitle)}</strong> and cleared it. It is live now and accepting applications.`,
    ),
    textLines: [`A moderator cleared ${args.jobTitle}. It is live and accepting applications.`],
    action: { label: "View the post", href: url(`/jobs/${args.jobSlug}`) },
  });
}
