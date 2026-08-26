import type { ApplicationStatus, PlanTier } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  applyToJobTx,
  countApplicationsSince,
  getJobWithApplicationsForRecruiter,
  markSubmittedApplicationsViewed,
  nthOldestApplicationSince,
  setApplicationNoteForRecruiter,
  updateApplicationStatusForRecruiter,
} from "@/lib/db/application";
import { getPublicJobBySlug } from "@/lib/db/job-browse";
import {
  getFreelancerProfileByUserId,
  getRecruiterProfileByUserId,
  getUserPlan,
} from "@/lib/db/users";
import { getEntitlements } from "@/lib/pricing/entitlements";
import {
  APPLICATION_WINDOW_DAYS,
  applicationQuotaForPlan,
  earlyAccessCutoffFor,
} from "@/lib/pricing/plans";
import type { ApplyToJobInput } from "@/lib/validations/application";

import { onApplicationDecided, onApplicationSubmitted } from "./notify";
import { isPlausibleId } from "./slug";

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

  // The company is told. Runs after the response, and cannot fail the apply.
  onApplicationSubmitted(result.applicationId);

  return {
    ok: true,
    applicationId: result.applicationId,
    remaining: quota === null ? null : Math.max(0, quota - result.used),
  };
}

// ── Recruiter inbox ──────────────────────────────────────────────────────────

/**
 * Which statuses a recruiter may move an application BETWEEN. WITHDRAWN is
 * freelancer-owned and terminal for the recruiter; nothing returns to
 * SUBMITTED. Pure, so the whole matrix is unit-tested.
 */
const RECRUITER_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  SUBMITTED: ["VIEWED", "SHORTLISTED", "REJECTED"],
  VIEWED: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["REJECTED"],
  REJECTED: ["SHORTLISTED"], // recruiters change their minds
  WITHDRAWN: [],
};

export function canRecruiterTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return RECRUITER_TRANSITIONS[from].includes(to);
}

/** Every status the given target may legally be reached FROM. */
export function recruiterTransitionSources(to: ApplicationStatus): ApplicationStatus[] {
  return (Object.keys(RECRUITER_TRANSITIONS) as ApplicationStatus[]).filter((from) =>
    canRecruiterTransition(from, to),
  );
}

type RecruiterStanding =
  | { ok: true; recruiterId: string; plan: PlanTier }
  | { ok: false; reason: "no-recruiter-profile" | "banned" };

async function recruiterStanding(userId: string): Promise<RecruiterStanding> {
  const profile = await getRecruiterProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-recruiter-profile" };
  if (profile.isBanned) return { ok: false, reason: "banned" };
  const plan = await getUserPlan(userId);
  return { ok: true, recruiterId: profile.id, plan };
}

export type InboxJob = NonNullable<Awaited<ReturnType<typeof getJobWithApplicationsForRecruiter>>>;

export type InboxResult =
  | { ok: true; job: InboxJob; canUseNotes: boolean }
  | { ok: false; reason: "no-recruiter-profile" | "banned" | "not-found" };

/**
 * The inbox for one owned job. Opening it marks every SUBMITTED application
 * VIEWED (idempotent) BEFORE the list is read, so what the recruiter sees is
 * what the freelancer will see reflected in their own status.
 */
export async function getJobInboxForUser(userId: string, jobId: string): Promise<InboxResult> {
  // An implausible id cannot match a row and must not reach Postgres (a NUL
  // byte there is a 500, not a 404).
  if (!isPlausibleId(jobId)) return { ok: false, reason: "not-found" };

  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;

  await markSubmittedApplicationsViewed(jobId, standing.recruiterId);
  const job = await getJobWithApplicationsForRecruiter(jobId, standing.recruiterId);
  if (!job) return { ok: false, reason: "not-found" };

  return { ok: true, job, canUseNotes: notesAllowedForRecruiter(standing.plan) };
}

/**
 * Whether private notes are available. Reads the entitlement object rather
 * than re-deciding it: this file used to carry its own `plan === GROWTH ||
 * plan === TEAM`, which is the same rule written twice and therefore a rule
 * that can drift in one place only.
 *
 * The role is pinned to RECRUITER because the caller has already resolved a
 * recruiter profile — a freelancer never reaches this.
 */
export function notesAllowedForRecruiter(plan: PlanTier): boolean {
  return getEntitlements({ role: "RECRUITER", plan }).recruiter.privateNotes;
}

export type InboxActionResult =
  | { ok: true }
  | { ok: false; reason: "no-recruiter-profile" | "banned" | "not-found" | "invalid-transition" }
  | { ok: false; reason: "plan-required" };

/** Shortlist or reject — the only recruiter-initiated decisions. */
export async function setApplicationStatusForUser(
  userId: string,
  applicationId: string,
  to: "SHORTLISTED" | "REJECTED",
): Promise<InboxActionResult> {
  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;

  const done = await updateApplicationStatusForRecruiter({
    applicationId,
    recruiterId: standing.recruiterId,
    to,
    allowedFrom: recruiterTransitionSources(to),
  });
  // 0 rows: not owned, not found, or an illegal/raced transition — all
  // surface identically so ids cannot be probed.
  if (!done) return { ok: false, reason: "invalid-transition" };

  // Only the two outcomes a person is waiting to hear about. VIEWED is not a
  // decision and mailing it would train people to ignore us.
  if (to === "SHORTLISTED" || to === "REJECTED") {
    onApplicationDecided(applicationId, to);
  }
  return { ok: true };
}

/**
 * Sets or clears the private recruiter note. Growth tier and above, enforced
 * HERE — the UI hiding the field is cosmetic (CLAUDE.md).
 */
export async function setApplicationNoteForUser(
  userId: string,
  applicationId: string,
  note: string | null,
): Promise<InboxActionResult> {
  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;
  if (!notesAllowedForRecruiter(standing.plan)) return { ok: false, reason: "plan-required" };

  const done = await setApplicationNoteForRecruiter(applicationId, standing.recruiterId, note);
  return done ? { ok: true } : { ok: false, reason: "not-found" };
}
