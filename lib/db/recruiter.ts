import type { RecruiterOnboardingInput } from "@/lib/validations/recruiter";

import { prisma } from "./client";

/**
 * Prisma access for recruiter profiles. Business logic (slug generation, role
 * checks, logo upload) lives in the service layer.
 */

/** Existing recruiter slugs equal to `base` or starting with `base-`. */
export async function findRecruiterSlugsLike(base: string): Promise<Set<string>> {
  const rows = await prisma.recruiterProfile.findMany({
    where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

export type CreateRecruiterProfileArgs = {
  userId: string;
  slug: string;
  input: RecruiterOnboardingInput;
  logoUrl: string | null;
};

/**
 * Creates the recruiter profile. tier is left to its schema default
 * (UNVERIFIED) — new recruiters are never created verified. The unique
 * constraints on userId and slug are the last line of defence against a
 * double submit or a slug race; a conflict throws for the service to map.
 */
export async function createRecruiterProfile(
  args: CreateRecruiterProfileArgs,
): Promise<{ id: string; slug: string }> {
  const { userId, slug, input, logoUrl } = args;
  return prisma.recruiterProfile.create({
    data: {
      userId,
      slug,
      companyName: input.companyName,
      companyDomain: input.companyDomain,
      registrationNo: input.registrationNo,
      linkedinUrl: input.linkedinUrl,
      websiteUrl: input.websiteUrl,
      description: input.description,
      country: input.country,
      logoUrl,
    },
    select: { id: true, slug: true },
  });
}
