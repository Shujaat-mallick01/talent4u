import { Prisma } from "@/lib/generated/prisma/client";
import {
  createFreelancerProfileWithSkills,
  findExistingSkillSlugs,
  findFreelancerSlugsLike,
} from "@/lib/db/freelancer";
import { getUserAuthState } from "@/lib/db/users";
import type { FreelancerOnboardingInput } from "@/lib/validations/freelancer";

import { scanProfileProse, type ProfileProseFlag } from "./profile-safety";
import { conflictField, pickAvailableSlug, slugify as slugifyBase } from "./slug";

/**
 * Freelancer profile business logic. Callers (a Server Action today) pass an
 * already-Zod-validated input; this layer re-checks the invariants that need
 * the database — the caller's role, that no profile exists yet, and that the
 * skills are real — then generates a slug and writes.
 */

export type OnboardFreelancerResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "wrong-role" | "already-onboarded" | "no-valid-skills" | "conflict" }
  | { ok: false; reason: "flagged"; flag: ProfileProseFlag };

// Slug collisions are expected under concurrency and are retried; a userId
// collision means the account genuinely already has a profile. Everything
// else is an unexpected conflict.
const SLUG_RETRY_LIMIT = 5;

/** A display name → slug base, falling back to "freelancer" when empty. */
export const slugify = (displayName: string): string => slugifyBase(displayName, "freelancer");

export { pickAvailableSlug };

export async function generateUniqueFreelancerSlug(displayName: string): Promise<string> {
  const base = slugify(displayName);
  const taken = await findFreelancerSlugsLike(base);
  return pickAvailableSlug(base, taken);
}

/**
 * Completes freelancer onboarding: verifies the caller is a FREELANCER who has
 * not onboarded, drops any skill slugs that are not real, generates a unique
 * slug, and creates the profile. Role and one-profile-per-user are enforced
 * here and, ultimately, by the database's composite FK and unique constraints.
 */
export async function onboardFreelancer(
  userId: string,
  input: FreelancerOnboardingInput,
): Promise<OnboardFreelancerResult> {
  const state = await getUserAuthState(userId);
  if (!state || state.role !== "FREELANCER") return { ok: false, reason: "wrong-role" };
  if (state.hasProfile) return { ok: false, reason: "already-onboarded" };

  // Same scan the editor applies. A freelancer profile is public indexed prose
  // too, and "pay for my course first" is the same trigger category from the
  // other side of the marketplace.
  const flag = scanProfileProse([
    { field: "bio", text: input.bio },
    { field: "headline", text: input.headline },
    { field: "displayName", text: input.displayName },
  ]);
  if (flag) return { ok: false, reason: "flagged", flag };

  // Scrub skills against the Skill table — never trust client-supplied slugs.
  const existing = await findExistingSkillSlugs(input.skills.map((s) => s.slug));
  const skillSlugs = input.skills
    .filter((s) => existing.has(s.slug))
    .map((s) => ({ slug: s.slug, yearsExp: s.yearsExp }));
  if (skillSlugs.length === 0) return { ok: false, reason: "no-valid-skills" };

  // Re-pick the slug on each attempt: a concurrent onboarding that just took
  // "jane-doe" will now be visible, so the next pick lands on "jane-doe-2".
  for (let attempt = 0; attempt < SLUG_RETRY_LIMIT; attempt += 1) {
    const slug = await generateUniqueFreelancerSlug(input.displayName);
    try {
      const profile = await createFreelancerProfileWithSkills({ userId, slug, input, skillSlugs });
      return { ok: true, slug: profile.slug };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const field = conflictField(error);
        // The account already has a profile — nothing to retry.
        if (field === "userId") return { ok: false, reason: "already-onboarded" };
        // A slug race: another attempt regenerates and usually succeeds.
        if (field === "slug") continue;
        return { ok: false, reason: "conflict" };
      }
      throw error;
    }
  }
  // Exhausted retries against a persistently contended slug.
  return { ok: false, reason: "conflict" };
}
