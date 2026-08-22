import { isApprovalMarker } from "@/lib/validations/freelancer-verification";
import { findExistingSkillSlugs } from "@/lib/db/freelancer";
import {
  getFreelancerProfileForEdit,
  getRecruiterProfileForEdit,
  updateFreelancerProfileWithSkills,
  updateRecruiterProfile,
} from "@/lib/db/profile-edit";
import {
  setFreelancerAvatarUrl,
  setRecruiterLogoUrl,
} from "@/lib/db/profile-edit";
import { getUserAuthState } from "@/lib/db/users";
import {
  uploadCompanyLogoUpdate,
  uploadFreelancerAvatar,
  validateProfileImage,
} from "@/lib/storage/profile-images";
import type { RecruiterTier } from "@/lib/generated/prisma/enums";
import type {
  CompanyProfileEditInput,
  FreelancerProfileEditInput,
} from "@/lib/validations/profile-edit";

/**
 * Profile editing business logic.
 *
 * Callers pass an already-Zod-validated input; this layer re-checks everything
 * that needs the database — who is asking, whether they still have standing,
 * and whether the skills are real — then writes.
 *
 * The invariants, in one place:
 *
 *   Owner only      Every profile is looked up by the CALLER'S userId. There is
 *                   no profile id parameter to forge, so editing someone else's
 *                   page is not refused, it is unrepresentable.
 *
 *   Banned refused  A removed employer cannot rewrite the company page that
 *                   /removed-employers points at.
 *
 *   Deactivated OK  A profile that has been taken down is still editable. The
 *                   usual reason a page is down is that something on it was
 *                   wrong; refusing edits would trap the person there.
 *
 *   Evidence frozen The three fields a VERIFIED badge was granted on are not in
 *                   the input schema and not in the write. See
 *                   canEditVerificationEvidence below.
 */

export type UpdateFreelancerProfileResult =
  | {
      ok: true;
      slug: string;
      /**
       * True when this save changed the work links while a verification
       * submission was pending, withdrawing it — the UI must say so, or the
       * person keeps waiting on a review that is no longer queued.
       */
      verificationWithdrawn: boolean;
      /**
       * True when this save changed the work links after an approval was
       * recorded, clearing it — the person must re-submit for review.
       */
      approvalCleared: boolean;
    }
  | { ok: false; reason: "wrong-role" | "no-profile" | "no-valid-skills" };

/**
 * Saves a freelancer's public profile.
 *
 * The slug travels back out unchanged and is never written: it is the public
 * URL, and a rename that moved it would break every link, search result, and
 * application that already points there.
 */
export async function updateFreelancerProfileForUser(
  userId: string,
  input: FreelancerProfileEditInput,
): Promise<UpdateFreelancerProfileResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "FREELANCER") return { ok: false, reason: "wrong-role" };

  const profile = await getFreelancerProfileForEdit(userId);
  if (!profile) return { ok: false, reason: "no-profile" };

  // Scrub against the Skill table — a slug from the client is a suggestion,
  // never a fact. Same rule onboarding applies.
  const existing = await findExistingSkillSlugs(input.skills.map((s) => s.slug));
  const skillSlugs = input.skills
    .filter((s) => existing.has(s.slug))
    .map((s) => ({ slug: s.slug, yearsExp: s.yearsExp }));
  // A save that wiped every skill would quietly make the profile unfindable,
  // so an all-unknown selection is refused rather than written.
  if (skillSlugs.length === 0) return { ok: false, reason: "no-valid-skills" };

  // Changing the work links while a verification submission is pending pulls
  // the submission back out of the queue: those links ARE the evidence, and a
  // reviewer must never judge a set different from what was submitted. Same
  // rule the recruiter flow applies to its evidence fields. Unrelated edits
  // (bio, rate, skills) leave the submission in place.
  const linksChanged =
    (input.githubUrl ?? null) !== (profile.githubUrl ?? null) ||
    (input.portfolioUrl ?? null) !== (profile.portfolioUrl ?? null) ||
    (input.linkedinUrl ?? null) !== (profile.linkedinUrl ?? null);
  const withdrawVerificationSubmission =
    linksChanged && profile.verificationSubmittedAt !== null;
  // An approval already granted does not survive its evidence changing either:
  // the marker says a reviewer confirmed THESE links, and replacing them makes
  // that record certify pages nobody opened. Cleared in the same transaction,
  // returning the profile to un-reviewed so it can be re-submitted.
  const clearWorkApproval = linksChanged && isApprovalMarker(profile.verificationNote);

  await updateFreelancerProfileWithSkills({
    freelancerId: profile.id,
    data: {
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
    skillSlugs,
    withdrawVerificationSubmission,
    clearWorkApproval,
  });

  return {
    ok: true,
    slug: profile.slug,
    verificationWithdrawn: withdrawVerificationSubmission,
    approvalCleared: clearWorkApproval,
  };
}

/**
 * Whether the three verification-evidence fields may still be changed.
 *
 * True only while UNVERIFIED. Once a reviewer has approved a company, the
 * domain, registration number and LinkedIn page that the approval was based on
 * are frozen: a badge that can have its evidence swapped afterwards certifies
 * nothing. Changing them from then on means being re-reviewed.
 */
export function canEditVerificationEvidence(tier: RecruiterTier): boolean {
  return tier === "UNVERIFIED";
}

export type UpdateCompanyProfileResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "wrong-role" | "no-profile" | "banned" };

/**
 * Saves the editable half of a company page: name, website, description,
 * country. The verification evidence is not reachable from here at any tier —
 * it is absent from the input schema and from the write.
 */
export async function updateCompanyProfileForUser(
  userId: string,
  input: CompanyProfileEditInput,
): Promise<UpdateCompanyProfileResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "RECRUITER") return { ok: false, reason: "wrong-role" };

  const profile = await getRecruiterProfileForEdit(userId);
  if (!profile) return { ok: false, reason: "no-profile" };
  // A removed employer keeps their record — that is the point of publishing
  // removals — but they do not get to rewrite it.
  if (profile.isBanned) return { ok: false, reason: "banned" };

  await updateRecruiterProfile(profile.id, {
    companyName: input.companyName,
    websiteUrl: input.websiteUrl,
    description: input.description,
    country: input.country,
  });

  return { ok: true, slug: profile.slug };
}

export type ProfileImageResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Uploads and sets the freelancer's avatar. Ownership is the same structural
 * rule as every other edit here: the profile is looked up by the caller's own
 * userId, so there is nothing to forge.
 */
export async function setFreelancerAvatarForUser(
  userId: string,
  file: unknown,
): Promise<ProfileImageResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "FREELANCER") {
    return { ok: false, message: "Only a freelancer account can set an avatar." };
  }
  const profile = await getFreelancerProfileForEdit(userId);
  if (!profile) return { ok: false, message: "Set up your profile first." };

  const valid = validateProfileImage(file);
  if (!valid.ok) return valid;

  const uploaded = await uploadFreelancerAvatar(userId, valid.file);
  if (!uploaded.ok) return uploaded;

  await setFreelancerAvatarUrl(profile.id, uploaded.url);
  return { ok: true, url: uploaded.url };
}

/** Uploads and sets the company logo — the change onboarding never allowed. */
export async function setCompanyLogoForUser(
  userId: string,
  file: unknown,
): Promise<ProfileImageResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "RECRUITER") {
    return { ok: false, message: "Only a company account can set a logo." };
  }
  const profile = await getRecruiterProfileForEdit(userId);
  if (!profile) return { ok: false, message: "Set up your company first." };
  if (profile.isBanned) return { ok: false, message: "This account cannot make changes." };

  const valid = validateProfileImage(file);
  if (!valid.ok) return valid;

  const uploaded = await uploadCompanyLogoUpdate(userId, valid.file);
  if (!uploaded.ok) return uploaded;

  await setRecruiterLogoUrl(profile.id, uploaded.url);
  return { ok: true, url: uploaded.url };
}
