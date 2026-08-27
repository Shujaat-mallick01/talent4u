import { randomBytes } from "node:crypto";

import { prisma } from "./client";

/**
 * Queries for the weekly job digest.
 *
 * Two rules shape all of it:
 *
 * 1. The send is IDEMPOTENT. `lastJobDigestAt` is both the selection predicate
 *    and the thing the send advances, so a cron that fires twice, a retry
 *    after a timeout, or two overlapping runs cannot mail the same person
 *    twice. Nothing here relies on the scheduler behaving.
 *
 * 2. Nobody is mailed a job they cannot yet open. Pro members see new posts
 *    EARLY_ACCESS_HOURS before everyone else, so the digest simply stops short
 *    of that window for all recipients — a weekly email loses nothing by
 *    ignoring the last few hours, and this way there is no plan lookup and no
 *    way to leak a post early.
 */

/** How long between digests for one person. */
export const DIGEST_INTERVAL_DAYS = 7;

/** Most jobs one email will list. Beyond this it stops being scannable. */
export const DIGEST_JOB_LIMIT = 6;

export type DigestRecipient = {
  userId: string;
  email: string;
  displayName: string;
  unsubscribeToken: string | null;
  lastJobDigestAt: Date | null;
  skillIds: string[];
};

/**
 * Freelancers due a digest: opted in, with a live profile, and either never
 * sent one or last sent more than an interval ago.
 *
 * Ordered oldest-first so a run that is cut short resumes where it stopped
 * rather than starting again from the same few accounts.
 */
export async function listFreelancersDueDigest(
  now: Date,
  limit: number,
): Promise<DigestRecipient[]> {
  const due = new Date(now.getTime() - DIGEST_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.user.findMany({
    where: {
      role: "FREELANCER",
      jobDigestOptIn: true,
      // A profile taken down means the person has stepped away. Mailing them
      // weekly about jobs is exactly what they asked to stop.
      freelancer: { is: { deactivatedAt: null } },
      OR: [{ lastJobDigestAt: null }, { lastJobDigestAt: { lt: due } }],
    },
    orderBy: [{ lastJobDigestAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      email: true,
      unsubscribeToken: true,
      lastJobDigestAt: true,
      freelancer: {
        select: {
          displayName: true,
          skills: { select: { skillId: true } },
        },
      },
    },
  });

  return rows.flatMap((r) =>
    r.freelancer
      ? [
          {
            userId: r.id,
            email: r.email,
            displayName: r.freelancer.displayName,
            unsubscribeToken: r.unsubscribeToken,
            lastJobDigestAt: r.lastJobDigestAt,
            skillIds: r.freelancer.skills.map((s) => s.skillId),
          },
        ]
      : [],
  );
}

export type DigestJob = {
  slug: string;
  title: string;
  companyName: string;
  budgetMinUsd: number | null;
  budgetMaxUsd: number | null;
  isRemote: boolean;
  matchedSkills: number;
};

/**
 * Jobs worth mailing this person: published since we last wrote to them,
 * sharing at least one skill with their profile, from a company in good
 * standing.
 *
 * `publishedBefore` is the early-access cutoff — see the note at the top.
 */
export async function matchingJobsForDigest(args: {
  skillIds: string[];
  publishedAfter: Date;
  publishedBefore: Date;
  limit: number;
}): Promise<DigestJob[]> {
  const { skillIds, publishedAfter, publishedBefore, limit } = args;
  if (skillIds.length === 0) return [];

  const rows = await prisma.job.findMany({
    where: {
      status: "ACTIVE",
      publishedAt: { gt: publishedAfter, lte: publishedBefore },
      recruiter: { isBanned: false },
      skills: { some: { skillId: { in: skillIds } } },
    },
    orderBy: { publishedAt: "desc" },
    // A few more than we will show, so the sort by match strength below has
    // something to choose between rather than just re-ordering the same six.
    take: limit * 3,
    select: {
      slug: true,
      title: true,
      budgetMinUsd: true,
      budgetMaxUsd: true,
      isRemote: true,
      recruiter: { select: { companyName: true } },
      skills: { select: { skillId: true } },
    },
  });

  const wanted = new Set(skillIds);
  return rows
    .map((job) => ({
      slug: job.slug,
      title: job.title,
      companyName: job.recruiter.companyName,
      budgetMinUsd: job.budgetMinUsd,
      budgetMaxUsd: job.budgetMaxUsd,
      isRemote: job.isRemote,
      matchedSkills: job.skills.filter((s) => wanted.has(s.skillId)).length,
    }))
    // Strongest match first. Ties keep the newest-first order above, because
    // Array.prototype.sort is stable.
    .sort((a, b) => b.matchedSkills - a.matchedSkills)
    .slice(0, limit);
}

/**
 * Records that this person has been mailed, and gives them an unsubscribe
 * token if they did not have one.
 *
 * Called whether or not there were jobs to send: an account with no matches
 * has still been considered this week, and re-checking it on every run would
 * put the whole no-match population at the front of the queue forever.
 */
export async function markDigestSent(userId: string, at: Date): Promise<string> {
  const row = await prisma.user.update({
    where: { id: userId },
    data: { lastJobDigestAt: at },
    select: { unsubscribeToken: true },
  });

  // Never rotate one that exists: links in mail already sent have to keep
  // working, and rotating silently breaks every digest sent before today.
  if (row.unsubscribeToken) return row.unsubscribeToken;

  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: userId }, data: { unsubscribeToken: token } });
  return token;
}

/** Turns off the digest from a mailed link, with no session involved. */
export async function unsubscribeByToken(token: string): Promise<{ email: string } | null> {
  if (token.length < 16 || token.length > 128) return null;
  const user = await prisma.user.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, email: true, jobDigestOptIn: true },
  });
  if (!user) return null;

  if (user.jobDigestOptIn) {
    await prisma.user.update({ where: { id: user.id }, data: { jobDigestOptIn: false } });
  }
  // Already off is a success, not an error: people click these twice.
  return { email: user.email };
}

/**
 * Turns it back on from the same link.
 *
 * The unsubscribe page needs this because it acts on a GET: mail security
 * scanners and link previewers fetch every URL in a message before a human
 * sees it, so somebody who never clicked can arrive already unsubscribed. One
 * click to stop, one click to undo, and neither needs a session.
 */
export async function resubscribeByToken(token: string): Promise<{ email: string } | null> {
  if (token.length < 16 || token.length > 128) return null;
  const user = await prisma.user.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, email: true },
  });
  if (!user) return null;
  await prisma.user.update({ where: { id: user.id }, data: { jobDigestOptIn: true } });
  return { email: user.email };
}

/** The settings toggle. */
export async function setJobDigestOptIn(userId: string, optIn: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { jobDigestOptIn: optIn } });
}
