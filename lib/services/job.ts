import type { PlanTier, RecruiterTier } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  closeJobForRecruiter,
  createDraftJob,
  findJobSlugsLike,
  getEditableJobForRecruiter,
  publishJobTx,
  updateDraftJob,
  withdrawHeldJobForRecruiter,
} from "@/lib/db/job";
import { findSkillsBySlugs, getCategoryIdBySlug } from "@/lib/db/taxonomy";
import { getRecruiterProfileByUserId, getUserPlan } from "@/lib/db/users";
import { effectiveJobSlots } from "@/lib/pricing/entitlements";
import type { JobPostInput } from "@/lib/validations/job";

import { onJobHeld } from "./notify";
import { scanTextForSafetyFlags } from "./safety";
import { conflictField, pickAvailableSlug, slugify } from "./slug";

/**
 * Job posting business logic. Every entry point re-establishes the caller's
 * standing from the database (RECRUITER role via the profile lookup, not
 * banned) — the Server Action's requireRole is the first wall, this is the
 * second, and the DB constraints are the last.
 *
 * The active-post cap is enforced inside publishJobTx under a row lock, so
 * concurrent publishes cannot overshoot it. CLAUDE.md: Free = 1, Growth = 5,
 * Team = unlimited; a PENDING_REVIEW job holds a slot.
 */

const SLUG_RETRY_LIMIT = 5;

export type JobActionFailure =
  | { ok: false; reason: "no-recruiter-profile" }
  | { ok: false; reason: "banned" }
  | { ok: false; reason: "invalid-category" }
  | { ok: false; reason: "no-valid-skills" }
  | { ok: false; reason: "not-publishable" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "cap-reached"; cap: number; used: number; plan: PlanTier };

export type CreateJobResult = { ok: true; jobId: string; slug: string } | JobActionFailure;
export type UpdateJobResult = { ok: true } | JobActionFailure;
export type PublishJobResult = { ok: true; status: "ACTIVE" | "PENDING_REVIEW" } | JobActionFailure;
export type CloseJobResult = { ok: true } | JobActionFailure;

type RecruiterStanding =
  // The tier travels with the id: it caps posts independently of the plan, so
  // every caller that reads one needs the other.
  | { ok: true; recruiterId: string; tier: RecruiterTier }
  | { ok: false; reason: "no-recruiter-profile" | "banned" };

async function recruiterStanding(userId: string): Promise<RecruiterStanding> {
  const profile = await getRecruiterProfileByUserId(userId);
  if (!profile) return { ok: false, reason: "no-recruiter-profile" };
  if (profile.isBanned) return { ok: false, reason: "banned" };
  return { ok: true, recruiterId: profile.id, tier: profile.tier };
}

type ResolvedTaxonomy =
  | { ok: true; categoryId: string; skillIds: string[] }
  | { ok: false; reason: "invalid-category" | "no-valid-skills" };

async function resolveTaxonomy(input: JobPostInput): Promise<ResolvedTaxonomy> {
  const categoryId = await getCategoryIdBySlug(input.categorySlug);
  if (!categoryId) return { ok: false, reason: "invalid-category" };
  // Scrub client-supplied skill slugs against the Skill table.
  const skills = await findSkillsBySlugs(input.skillSlugs);
  if (skills.length === 0) return { ok: false, reason: "no-valid-skills" };
  return { ok: true, categoryId, skillIds: skills.map((s) => s.id) };
}

export async function createJobDraftForUser(
  userId: string,
  input: JobPostInput,
): Promise<CreateJobResult> {
  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;

  const taxonomy = await resolveTaxonomy(input);
  if (!taxonomy.ok) return taxonomy;

  for (let attempt = 0; attempt < SLUG_RETRY_LIMIT; attempt += 1) {
    const base = slugify(input.title, "job");
    const slug = pickAvailableSlug(base, await findJobSlugsLike(base));
    try {
      const job = await createDraftJob({
        recruiterId: standing.recruiterId,
        slug,
        categoryId: taxonomy.categoryId,
        skillIds: taxonomy.skillIds,
        input,
      });
      return { ok: true, jobId: job.id, slug: job.slug };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (conflictField(error) === "slug") continue;
        return { ok: false, reason: "conflict" };
      }
      throw error;
    }
  }
  return { ok: false, reason: "conflict" };
}

export async function updateJobDraftForUser(
  userId: string,
  jobId: string,
  input: JobPostInput,
): Promise<UpdateJobResult> {
  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;

  const taxonomy = await resolveTaxonomy(input);
  if (!taxonomy.ok) return taxonomy;

  // Drafts were never public, so a title change re-derives the slug — a job
  // published later should not carry a URL from an abandoned earlier title.
  // Slugs already in the new title's numbered family are kept as-is.
  const current = await getEditableJobForRecruiter(jobId, standing.recruiterId);
  if (!current) return { ok: false, reason: "not-found" };
  const base = slugify(input.title, "job");
  const keepSlug = current.slug === base || new RegExp(`^${base}-\\d+$`).test(current.slug);

  for (let attempt = 0; attempt < SLUG_RETRY_LIMIT; attempt += 1) {
    const slug = keepSlug ? undefined : pickAvailableSlug(base, await findJobSlugsLike(base));
    try {
      const updated = await updateDraftJob({
        jobId,
        recruiterId: standing.recruiterId,
        categoryId: taxonomy.categoryId,
        skillIds: taxonomy.skillIds,
        input,
        slug,
      });
      return updated ? { ok: true } : { ok: false, reason: "not-found" };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (conflictField(error) === "slug" && !keepSlug) continue;
        return { ok: false, reason: "conflict" };
      }
      throw error;
    }
  }
  return { ok: false, reason: "conflict" };
}

export async function publishJobForUser(userId: string, jobId: string): Promise<PublishJobResult> {
  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;

  const plan = await getUserPlan(userId);
  // Plan AND tier, stricter wins. CLAUDE.md's verification table caps an
  // UNVERIFIED company at one post; paying for Growth does not lift that.
  const cap = effectiveJobSlots(plan, standing.tier);

  let result: Awaited<ReturnType<typeof publishJobTx>>;
  try {
    result = await publishJobTx({
      jobId,
      recruiterId: standing.recruiterId,
      cap,
      scan: scanTextForSafetyFlags,
    });
  } catch (error: unknown) {
    // Lock-wait past the transaction timeout (publish burst) — a retryable
    // condition, not a 500. P2028 = tx aborted, P2024 = pool maxWait.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2028" || error.code === "P2024")
    ) {
      return { ok: false, reason: "conflict" };
    }
    throw error;
  }

  if (result.ok) {
    // A post that silently fails to appear is the worst version of this: the
    // recruiter assumes it is live and waits for applications that cannot come.
    if (result.status === "PENDING_REVIEW") onJobHeld(jobId);
    return { ok: true, status: result.status };
  }
  if (result.reason === "cap-reached") {
    // cap is non-null whenever the db reports cap-reached.
    return { ok: false, reason: "cap-reached", cap: cap ?? 0, used: result.used, plan };
  }
  return { ok: false, reason: result.reason };
}

export async function closeJobForUser(userId: string, jobId: string): Promise<CloseJobResult> {
  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;

  const closed = await closeJobForRecruiter(jobId, standing.recruiterId);
  return closed ? { ok: true } : { ok: false, reason: "not-found" };
}

/**
 * The recruiter's own exit from a held (PENDING_REVIEW) post — back to DRAFT,
 * freeing the plan slot. The safety flag stays OPEN for the moderation audit
 * trail, and any re-publish re-scans inside the transaction, so this can
 * never move flagged text toward ACTIVE.
 */
export async function withdrawJobForUser(userId: string, jobId: string): Promise<CloseJobResult> {
  const standing = await recruiterStanding(userId);
  if (!standing.ok) return standing;

  const withdrawn = await withdrawHeldJobForRecruiter(jobId, standing.recruiterId);
  return withdrawn ? { ok: true } : { ok: false, reason: "not-found" };
}
