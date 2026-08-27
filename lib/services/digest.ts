import { notifyJobDigest } from "@/lib/email/notifications";
import {
  DIGEST_INTERVAL_DAYS,
  DIGEST_JOB_LIMIT,
  listFreelancersDueDigest,
  markDigestSent,
  matchingJobsForDigest,
} from "@/lib/db/digest";
import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";
import { SITE_URL } from "@/lib/site-url";

/**
 * The weekly job digest.
 *
 * Four decisions worth stating, because each is the difference between a
 * useful email and the kind people filter:
 *
 * 1. NEVER SENT EMPTY. An account with no matches is still marked as
 *    considered, so it moves to the back of the queue, but nothing is mailed.
 *    A weekly "nothing matched you" is how a sender gets muted.
 *
 * 2. MARKED BEFORE SENT. `markDigestSent` runs first, so a crash, a timeout or
 *    a mail-provider hiccup mid-run can lose one digest but can never mail the
 *    same person twice. At-most-once is the right side to fail on here: a
 *    missed weekly email costs nothing, a duplicate costs trust.
 *
 * 3. NOTHING INSIDE THE EARLY-ACCESS WINDOW. Pro members see new posts
 *    EARLY_ACCESS_HOURS before everyone else. The digest stops short of that
 *    window for every recipient, so there is no plan lookup and no way for
 *    this to leak a post to a free account before its time.
 *
 * 4. THE WINDOW IS PER PERSON. Jobs are selected since THAT person's last
 *    digest, not since a fixed date, so somebody who joins mid-week or whose
 *    digest failed last week gets the roles they missed rather than a gap.
 */

export type DigestRunSummary = {
  /** Accounts examined this run. */
  considered: number;
  /** Digests actually mailed. */
  sent: number;
  /** Considered, but had no matching jobs — marked, not mailed. */
  noMatches: number;
  /** Mail the provider refused. Marked anyway; see decision 2. */
  failed: number;
};

/** A budget as one short string, or null when the post states none. */
function budgetLabel(min: number | null, max: number | null): string | null {
  const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (min !== null && max !== null) return `${usd(min)}–${usd(max)}`;
  if (min !== null) return `From ${usd(min)}`;
  if (max !== null) return `Up to ${usd(max)}`;
  return null;
}

export async function runJobDigest(
  now: Date = new Date(),
  limit = 200,
): Promise<DigestRunSummary> {
  const recipients = await listFreelancersDueDigest(now, limit);

  // The far edge of the window: everything published up to this point is
  // visible to every plan by now.
  const publishedBefore = new Date(now.getTime() - EARLY_ACCESS_HOURS * 60 * 60 * 1000);
  const fallbackSince = new Date(
    now.getTime() - DIGEST_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
  );

  const summary: DigestRunSummary = {
    considered: recipients.length,
    sent: 0,
    noMatches: 0,
    failed: 0,
  };

  for (const person of recipients) {
    // Since we last wrote to them — so a missed week is caught up rather than
    // skipped. A brand-new account falls back to one interval.
    const publishedAfter = person.lastJobDigestAt ?? fallbackSince;

    const jobs = await matchingJobsForDigest({
      skillIds: person.skillIds,
      publishedAfter,
      publishedBefore,
      limit: DIGEST_JOB_LIMIT,
    });

    // Marked whether or not anything is sent: this account has had its turn,
    // and re-examining it on every run would park the entire no-match
    // population permanently at the front of the queue.
    const token = await markDigestSent(person.userId, now);

    if (jobs.length === 0) {
      summary.noMatches += 1;
      continue;
    }

    const result = await notifyJobDigest({
      to: person.email,
      displayName: person.displayName,
      unsubscribeUrl: `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`,
      jobs: jobs.map((j) => ({
        title: j.title,
        companyName: j.companyName,
        budget: budgetLabel(j.budgetMinUsd, j.budgetMaxUsd),
        slug: j.slug,
      })),
    });

    if (result.ok) summary.sent += 1;
    else summary.failed += 1;
  }

  return summary;
}
