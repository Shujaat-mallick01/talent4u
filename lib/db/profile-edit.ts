import type {
  CompanyProfileEditInput,
  FreelancerProfileEditInput,
} from "@/lib/validations/profile-edit";

import { prisma } from "./client";

/**
 * Prisma access for profile editing. Reads are keyed by userId, never by a
 * profile id from the client — that is what makes "only the owner can edit"
 * structural rather than a check someone can forget to write. Writes name
 * every column explicitly, so a wider input object can never carry an extra
 * column (a tier, a ban flag, a slug) into an update.
 */

/** The freelancer's own editable record, plus the state the editor renders. */
export async function getFreelancerProfileForEdit(userId: string) {
  return prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      // Read-only in the editor: shown so the person can see the public URL a
      // rename will NOT change.
      slug: true,
      displayName: true,
      headline: true,
      bio: true,
      country: true,
      timezone: true,
      hourlyRateUsd: true,
      isOpenToWork: true,
      githubUrl: true,
      portfolioUrl: true,
      linkedinUrl: true,
      verification: true,
      // The current photo, for the editor's photo block.
      avatarUrl: true,
      // Whether a verification submission is sitting in the admin queue —
      // an edit that changes the work links must pull it back out, or a
      // reviewer judges evidence that is no longer what was submitted.
      verificationSubmittedAt: true,
      // The work-link approval marker, if any — a link change must invalidate
      // it, or the record certifies evidence no reviewer ever opened.
      verificationNote: true,
      // A profile can be taken down and still edited — people fix a page
      // before putting it back up.
      deactivatedAt: true,
      skills: {
        select: {
          yearsExp: true,
          skill: { select: { slug: true, name: true } },
        },
        orderBy: { skill: { name: "asc" } },
      },
    },
  });
}

export type FreelancerProfileForEdit = NonNullable<
  Awaited<ReturnType<typeof getFreelancerProfileForEdit>>
>;

/** The profile columns an edit writes — the input minus its skill set. */
export type FreelancerProfileUpdate = Omit<FreelancerProfileEditInput, "skills">;

/**
 * Updates the profile and replaces its whole skill set in one transaction.
 *
 * Replace rather than diff: the form submits the complete set, so a removal is
 * simply an absence, and a partial write that dropped a row but failed before
 * inserting the replacements would leave a profile with no skills at all.
 *
 * `slug` is not in the payload and must never be added: it is the public URL.
 */
export async function updateFreelancerProfileWithSkills(args: {
  freelancerId: string;
  data: FreelancerProfileUpdate;
  /** Already scrubbed against the Skill table by the service. */
  skillSlugs: { slug: string; yearsExp: number | null }[];
  /**
   * Set when this edit changes the work links while a verification submission
   * is pending: the submission is withdrawn in the same transaction, so a
   * reviewer can never judge evidence different from what was submitted.
   * Mirrors updateVerificationDetails on the recruiter side.
   */
  withdrawVerificationSubmission?: boolean;
  /**
   * Set when this edit changes the work links AFTER an approval was recorded:
   * the "approved:" marker is cleared in the same transaction, returning the
   * profile to un-reviewed. An approval is of specific links; it does not
   * survive their replacement.
   */
  clearWorkApproval?: boolean;
}): Promise<void> {
  const { freelancerId, data, skillSlugs, withdrawVerificationSubmission, clearWorkApproval } = args;

  await prisma.$transaction(async (tx) => {
    await tx.freelancerProfile.update({
      where: { id: freelancerId },
      data: {
        displayName: data.displayName,
        headline: data.headline,
        bio: data.bio,
        country: data.country,
        timezone: data.timezone,
        hourlyRateUsd: data.hourlyRateUsd,
        isOpenToWork: data.isOpenToWork,
        githubUrl: data.githubUrl,
        portfolioUrl: data.portfolioUrl,
        linkedinUrl: data.linkedinUrl,
        ...(withdrawVerificationSubmission ? { verificationSubmittedAt: null } : {}),
        ...(clearWorkApproval ? { verificationNote: null } : {}),
      },
    });

    await tx.skillOnFreelancer.deleteMany({ where: { freelancerId } });

    if (skillSlugs.length > 0) {
      const rows = await tx.skill.findMany({
        where: { slug: { in: skillSlugs.map((s) => s.slug) } },
        select: { id: true, slug: true },
      });
      const yearsBySlug = new Map(skillSlugs.map((s) => [s.slug, s.yearsExp]));
      await tx.skillOnFreelancer.createMany({
        data: rows.map((s) => ({
          freelancerId,
          skillId: s.id,
          yearsExp: yearsBySlug.get(s.slug) ?? null,
        })),
      });
    }
  });
}

/**
 * The company's own editable record. The three verification-evidence fields
 * come back read-only: the page shows what a reviewer was given, and routes
 * changes to the verification flow.
 */
export async function getRecruiterProfileForEdit(userId: string) {
  return prisma.recruiterProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      slug: true,
      companyName: true,
      websiteUrl: true,
      description: true,
      country: true,
      logoUrl: true,
      // Read-only here. Editable only while UNVERIFIED, and only through
      // /dashboard/recruiter/verification.
      companyDomain: true,
      registrationNo: true,
      linkedinUrl: true,
      tier: true,
      isBanned: true,
      deactivatedAt: true,
    },
  });
}

export type RecruiterProfileForEdit = NonNullable<
  Awaited<ReturnType<typeof getRecruiterProfileForEdit>>
>;

/**
 * Writes the four editable company fields. Named one by one on purpose: this
 * is the last place a companyDomain could sneak into an approved company's
 * row, and it cannot from here.
 */
export async function updateRecruiterProfile(
  recruiterId: string,
  data: CompanyProfileEditInput,
): Promise<void> {
  await prisma.recruiterProfile.update({
    where: { id: recruiterId },
    data: {
      companyName: data.companyName,
      websiteUrl: data.websiteUrl,
      description: data.description,
      country: data.country,
    },
  });
}

/** Points the freelancer's public page at a freshly uploaded avatar. */
export async function setFreelancerAvatarUrl(freelancerId: string, url: string): Promise<void> {
  await prisma.freelancerProfile.update({
    where: { id: freelancerId },
    data: { avatarUrl: url },
  });
}

/** Points the company page at a freshly uploaded logo. */
export async function setRecruiterLogoUrl(recruiterId: string, url: string): Promise<void> {
  await prisma.recruiterProfile.update({
    where: { id: recruiterId },
    data: { logoUrl: url },
  });
}
