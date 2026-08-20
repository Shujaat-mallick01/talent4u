import type { PlanTier } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  applyToJobTx,
  countApplicationsSince,
  nthOldestApplicationSince,
} from "@/lib/db/application";
import { getPublicJobBySlug } from "@/lib/db/job-browse";
import { getFreelancerProfileByUserId, getUserPlan } from "@/lib/db/users";
import {
  APPLICATION_WINDOW_DAYS,
  applicationQuotaForPlan,
  earlyAccessCutoffFor,
} from "@/lib/pricing/plans";
import type { ApplyToJobInput } from "@/lib/validations/application";

/**
 * Application business logic. CLAUDE.md non-negotiable: free tier is 12
 * applications per rolling 30 days, enforced HERE (service layer, inside a
 * row-locked transaction) — the UI only displays what this layer decides.
 * Withdrawal never refunds quota.
 */

export const windowStartFrom = (now: Date): Date =>
  new Date(now.getTime() - APPLICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

export type ApplicationQuotaStatus = {
  plan: PlanTier;
  /** null = unlimited (Pro). */
  limit: number | null;
  used: number;
  /** null when unlimited. */
  remaining: number | null;
  /**
   * When the NEXT slot actually frees: the (used - limit + 1)-th oldest
   * counted application's expiry. Null while slots remain (or unlimited) —
   * a lapsed Pro far over the limit waits for many applications to age out,
   * not just the oldest.
   */
  nextSlotFreesAt: Date | null;
};

export type QuotaFailure = { ok: false; reason: "no-freelancer-profile" };

export async function getApplicationQuotaStatus(
  userId: string,
  now = new Date(),
): Promise<ApplicationQuotaStatus | QuotaFailure> {
  const profile = await getFreelancerProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-freelancer-profile" };

  const plan = await getUserPlan(userId);
  const limit = applicationQuotaForPlan(plan);
  const since = windowStartFrom(now);
  const used = await countApplicationsSince(profile.id, since);

  let nextSlotFreesAt: Date | null = null;
  if (limit !== null && used >= limit) {
    // The application whose ageing-out frees the next slot.
    const gate = await nthOldestApplicationSince(profile.id, since, used - limit);
    if (gate) {
      nextSlotFreesAt = new Date(gate.getTime() + APPLICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    }
  }

  return {
    plan,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    nextSlotFreesAt,
  };
}

export type ApplyResult =
  | { ok: true; applicationId: string; remaining: number | null }
  | { ok: false; reason: "no-freelancer-profile" }
  | { ok: false; reason: "job-not-available" }
  | { ok: false; reason: "already-applied" }
  | { ok: false; reason: "quota-exceeded"; limit: number; used: number }
  // A retryable lock-wait/pool timeout, never a 500.
  | { ok: false; reason: "conflict" };

export async function applyToJob(
  userId: string,
  jobSlug: string,
  input: ApplyToJobInput,
  now = new Date(),
): Promise<ApplyResult> {
  const profile = await getFreelancerProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-freelancer-profile" };

  const job = await getPublicJobBySlug(jobSlug);
  if (!job) return { ok: false, reason: "job-not-available" };

  const plan = await getUserPlan(userId);
  const quota = applicationQuotaForPlan(plan);
  const cutoff = earlyAccessCutoffFor(plan, now);

  // Availability (status/window/banned) is re-verified INSIDE the transaction
  // — this pre-fetch only resolves the slug to an id.
  let result: Awaited<ReturnType<typeof applyToJobTx>>;
  try {
    result = await applyToJobTx({
      jobId: job.id,
      freelancerId: profile.id,
      quota,
      windowStart: windowStartFrom(now),
      earlyAccessCutoff: cutoff,
      input,
    });
  } catch (error: unknown) {
    // Lock-wait past the tx timeout (an apply burst serializing on this
    // freelancer's profile row) — retryable, not a 500. P2028 = tx aborted,
    // P2024 = pool maxWait exhausted.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2028" || error.code === "P2024")
    ) {
      return { ok: false, reason: "conflict" };
    }
    throw error;
  }

  if (!result.ok) {
    if (result.reason === "quota-exceeded") {
      return { ok: false, reason: "quota-exceeded", limit: quota ?? 0, used: result.used };
    }
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    applicationId: result.applicationId,
    remaining: quota === null ? null : Math.max(0, quota - result.used),
  };
}
