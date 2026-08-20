import { getSession } from "@/lib/auth/session";
import { getUserPlan } from "@/lib/db/users";
import { earlyAccessCutoffFor } from "@/lib/pricing/plans";

/**
 * Which publishedAt cutoff the current viewer's browse query must apply.
 * Null (no cutoff — sees brand-new jobs) only for an active FREELANCER_PRO
 * subscription; logged-out and every other plan get the delayed window.
 * Server-side only: the entitlement derives from the session and the
 * subscription row, never from anything the client sent.
 */
export async function resolveEarlyAccessCutoff(now = new Date()): Promise<Date | null> {
  const session = await getSession();
  if (!session) return earlyAccessCutoffFor(null, now);
  const plan = await getUserPlan(session.userId);
  return earlyAccessCutoffFor(plan, now);
}
