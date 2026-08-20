import type { FreelancerOnboardingInput } from "@/lib/validations/freelancer";

import { prisma } from "./client";

/**
 * Prisma access for freelancer profiles. No business logic lives here — the
 * service layer owns slug generation, role checks, and orchestration.
 */

export type SkillOption = { slug: string; name: string };
export type SkillCategoryGroup = {
  slug: string;
  name: string;
  skills: SkillOption[];
};

/** The skill picker's source: categories with their skills, both alphabetical. */
export async function listSkillsGroupedByCategory(): Promise<SkillCategoryGroup[]> {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      skills: {
        orderBy: { name: "asc" },
        select: { slug: true, name: true },
      },
    },
  });
  return categories.filter((c) => c.skills.length > 0);
}

/** The subset of the given slugs that are real skills, for input scrubbing. */
export async function findExistingSkillSlugs(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const rows = await prisma.skill.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

/**
 * Existing freelancer slugs that equal `base` or start with `base-`. The
 * service uses this to pick the first free "base", "base-2", … variant in one
 * round trip instead of probing the database per candidate.
 */
export async function findFreelancerSlugsLike(base: string): Promise<Set<string>> {
  const rows = await prisma.freelancerProfile.findMany({
    where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

export type CreateFreelancerProfileArgs = {
  userId: string;
  slug: string;
  input: FreelancerOnboardingInput;
  /** Already scrubbed against the Skill table by the service. */
  skillSlugs: { slug: string; yearsExp: number | null }[];
};

/**
 * Creates the profile and its skill links atomically. The unique constraints
 * on userId and slug are the last line of defence against a double submit or a
 * slug race; a conflict surfaces as a thrown PrismaClientKnownRequestError the
 * service maps to a typed failure.
 */
export async function createFreelancerProfileWithSkills(
  args: CreateFreelancerProfileArgs,
): Promise<{ id: string; slug: string }> {
  const { userId, slug, input, skillSlugs } = args;

  return prisma.$transaction(async (tx) => {
    const profile = await tx.freelancerProfile.create({
      data: {
        userId,
        slug,
        displayName: input.displayName,
        headline: input.headline,
        bio: input.bio,
        country: input.country,
        timezone: input.timezone,
        hourlyRateUsd: input.hourlyRateUsd,
        isOpenToWork: input.isOpenToWork,
        githubUrl: input.githubUrl,
        portfolioUrl: input.portfolioUrl,
        linkedinUrl: input.linkedinUrl,
      },
      select: { id: true, slug: true },
    });

    if (skillSlugs.length > 0) {
      const skillIds = await tx.skill.findMany({
        where: { slug: { in: skillSlugs.map((s) => s.slug) } },
        select: { id: true, slug: true },
      });
      const yearsBySlug = new Map(skillSlugs.map((s) => [s.slug, s.yearsExp]));
      await tx.skillOnFreelancer.createMany({
        data: skillIds.map((s) => ({
          freelancerId: profile.id,
          skillId: s.id,
          yearsExp: yearsBySlug.get(s.slug) ?? null,
        })),
      });
    }

    return profile;
  });
}
