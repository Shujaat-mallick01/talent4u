import { cache } from "react";

import { getSession } from "@/lib/auth/session";
import { getUserPlan } from "@/lib/db/users";
import { earlyAccessCutoffFor } from "@/lib/pricing/plans";

/**
 * Which publishedAt cutoff the current viewer's browse query must apply.
 * Null (no cutoff — sees brand-new jobs) only for an active FREELANCER_PRO
 * subscription; logged-out and every other plan get the delayed window.
 * Server-side only: the entitlement derives from the session and the
 * subscription row, never from anything the client sent.
 *
 * cache()-wrapped so generateMetadata and the page share ONE cutoff sample
 * per request — they can never disagree about a job sitting exactly on the
 * 6-hour boundary — and the Subscription query runs once.
 */
export const resolveEarlyAccessCutoff = cache(async (): Promise<Date | null> => {
  const now = new Date();
  const session = await getSession();
  if (!session) return earlyAccessCutoffFor(null, now);
  const plan = await getUserPlan(session.userId);
  return earlyAccessCutoffFor(plan, now);
});
