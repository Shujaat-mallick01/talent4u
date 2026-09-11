import { sendEmail, type SendResult } from "./client";
import {
  button,
  emailLayout,
  escapeHtml,
  facts,
  jobList,
  paragraph,
  quote,
  textEmail,
  url,
} from "./layout";

/**
 * Every email the product sends, and why.
 *
 * Almost all of these are strictly TRANSACTIONAL: each is about something
 * that just happened to the recipient's own account, triggered by another
 * person's action, and each says so in its footer. Nothing transactional mails
 * anyone who has not taken part in the thing being reported, which is why none
 * of it carries an unsubscribe link and why none of it needs one.
 *
 * The weekly job digest is the exception, and it is the reason
 * User.jobDigestOptIn, User.unsubscribeToken and the settings toggle exist —
 * this file used to say they would be required before any such mail was added,
 * and they were. It is the ONLY function here that takes an unsubscribeUrl. If
 * a second one ever does, it is marketing, and it needs the same three things.
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
  /** Non-transactional mail only — the digest. See the note at the top. */
  unsubscribeUrl?: string;
}): Promise<NotifyOutcome> {
  const {
    event,
    to,
    subject,
    heading,
    preheader,
    reason,
    bodyHtml,
    textLines,
    action,
    unsubscribeUrl,
  } = args;

  const html = emailLayout({
    heading,
    preheader,
    reason,
    unsubscribeUrl,
    body: bodyHtml + (action ? button(action.label, action.href) : ""),
  });

  const result = await sendEmail({
    to,
    subject,
    html,
    text: textEmail({ heading, lines: textLines, action, reason, unsubscribeUrl }),
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

/**
 * A freelancer's work-link review came back. Scrupulously honest about what
 * approval does NOT change: the visible badge stays until ID verification
 * launches, and saying otherwise here would be the exact lie the review flow
 * was designed to avoid.
 */
export function notifyWorkLinksReviewed(args: {
  to: string;
  displayName: string;
  approved: boolean;
  note?: string | null;
}): Promise<NotifyOutcome> {
  return deliver({
    event: args.approved ? "work-links-approved" : "work-links-returned",
    to: args.to,
    subject: args.approved
      ? "Your work links passed review"
      : "Your work links need another look",
    heading: args.approved ? "Links reviewed and confirmed" : "One more pass needed",
    preheader: args.approved
      ? "A reviewer confirmed your links. The badge itself waits for ID verification."
      : "Your submission came back with a note.",
    reason: "You are receiving this because you submitted your work links for review on Talent4u.",
    bodyHtml: args.approved
      ? paragraph(
          `A reviewer opened your links and confirmed the work behind them is yours. Your visible badge does <strong style="color:#0E0E10;">not</strong> change yet — both badge levels involve an ID check that has not launched — but your review is on record, and you are first in line when it does.`,
        )
      : paragraph(`A reviewer could not confirm your links as submitted.`) +
        (args.note ? quote(args.note) : ""),
    textLines: args.approved
      ? [
          "A reviewer confirmed your work links.",
          "Your visible badge does not change yet — ID verification has not launched.",
          "Your review is on record for when it does.",
        ]
      : ["A reviewer could not confirm your links as submitted.", ...(args.note ? ["", args.note] : [])],
    action: args.approved
      ? { label: "See your verification status", href: url("/dashboard/freelancer/verification") }
      : { label: "Fix and resubmit", href: url("/dashboard/freelancer/verification") },
  });
}

// ── Onboarding ─────────────────────────────────────────────────────────────

/**
 * The first thing we ever send: an account exists.
 *
 * Transactional — they created it seconds ago — so no unsubscribe link. It
 * earns its place by answering the two questions a new account actually has,
 * which are "what does this cost me" and "what do I do now", rather than by
 * welcoming anyone.
 */
export function notifyWelcome(args: {
  to: string;
  displayName: string;
  role: "FREELANCER" | "RECRUITER";
}): Promise<NotifyOutcome> {
  const { to, displayName, role } = args;
  const isFreelancer = role === "FREELANCER";

  const next = isFreelancer
    ? {
        label: "Browse open jobs",
        href: url("/jobs"),
        line: "Browsing is free and unlimited, and you keep 100% of whatever you agree with a company. We are never in the middle of the payment, which is why we are never in a position to take a cut of it.",
        second:
          "Twelve applications every 30 days on the free plan. A profile with real links to your work is what gets replies, so it is worth ten minutes.",
      }
    : {
        label: "Post your first role",
        href: url("/dashboard/recruiter/jobs/new"),
        line: "Posting a role and receiving applications is free, on every plan, forever. We charge a flat subscription for the tools around hiring and take 0% of what anyone earns.",
        second:
          "New companies start Unverified, which shows on every post and caps you at one live role. Verifying takes a business email, a registration number and a LinkedIn page.",
      };

  return deliver({
    event: "welcome",
    to,
    subject: isFreelancer ? "Your Talent4u account is ready" : "Your company is on Talent4u",
    heading: `Welcome, ${displayName}`,
    preheader: "0% commission. Here is what to do first.",
    reason: "You are receiving this because you just created a Talent4u account.",
    bodyHtml: paragraph(escapeHtml(next.line)) + paragraph(escapeHtml(next.second)),
    textLines: [next.line, "", next.second],
    action: { label: next.label, href: next.href },
  });
}

// ── The weekly digest ──────────────────────────────────────────────────────

/**
 * Jobs matching this freelancer's skills, once a week.
 *
 * The ONLY non-transactional mail the product sends, and the only one that
 * takes an unsubscribeUrl. Nobody asked for it at the moment it arrives, so it
 * has to be refusable in one click from the mail itself, without signing in —
 * see lib/db/digest.ts and User.unsubscribeToken.
 *
 * Never sent empty: a weekly email that says "no jobs matched you" teaches
 * people to filter the sender, and the caller checks for that before calling.
 */
export function notifyJobDigest(args: {
  to: string;
  displayName: string;
  unsubscribeUrl: string;
  jobs: {
    title: string;
    companyName: string;
    /** Verification tier label. Required on every job card — email included. */
    tier: string;
    budget: string | null;
    slug: string;
  }[];
}): Promise<NotifyOutcome> {
  const { to, displayName, unsubscribeUrl, jobs } = args;

  const count = jobs.length;
  const lead =
    count === 1
      ? "One new role this week matches the skills on your profile."
      : `${count} new roles this week match the skills on your profile.`;

  return deliver({
    event: "job-digest",
    to,
    subject: count === 1 ? "1 new job matches your skills" : `${count} new jobs match your skills`,
    heading: `Jobs for you, ${displayName}`,
    preheader: lead,
    reason:
      "You are receiving this because your Talent4u profile lists skills these roles ask for.",
    unsubscribeUrl,
    bodyHtml:
      paragraph(escapeHtml(lead)) +
      jobList(jobs.map((j) => ({ ...j, href: url(`/jobs/${j.slug}`) }))) +
      paragraph(
        escapeHtml(
          "Applying is free up to your monthly limit, and you keep everything you earn.",
        ),
      ),
    textLines: [
      lead,
      "",
      ...jobs.map(
        (j) =>
          `${j.title} — ${j.companyName} (${j.tier})${j.budget ? ` · ${j.budget}` : ""}\n${url(`/jobs/${j.slug}`)}`,
      ),
    ],
    action: { label: "See every open job", href: url("/jobs") },
  });
}
