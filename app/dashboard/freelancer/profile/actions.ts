"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import {
  setFreelancerAvatarForUser,
  updateFreelancerProfileForUser,
} from "@/lib/services/profile-edit";
import { freelancerProfileEditSchema } from "@/lib/validations/profile-edit";

/**
 * Server Action behind the freelancer profile editor. requireRole runs before
 * any parsing, so a POST from another account — or from curl — is turned away
 * here rather than in the form. The service then looks the profile up by the
 * caller's own user id, which is what makes editing someone else's page
 * impossible to express, not merely refused.
 */

export type ProfileEditState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
};

const PAGE = "/dashboard/freelancer/profile";

// NOTE: a "use server" file may only export async functions (plus erased
// types) — the initial form state object lives in edit-form.tsx.

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function saveFreelancerProfile(
  _prev: ProfileEditState,
  formData: FormData,
): Promise<ProfileEditState> {
  const { user } = await requireRole("FREELANCER");

  // Blank rate → null ("rate on request"); anything else is handed to Zod as a
  // number so a non-numeric entry fails as a field error, not a crash.
  const rawRate = str(formData, "hourlyRateUsd").trim();
  const hourlyRateUsd = rawRate === "" ? null : Number(rawRate);

  let skills: unknown = [];
  try {
    const raw = str(formData, "skills");
    skills = raw ? JSON.parse(raw) : [];
  } catch {
    return {
      fieldErrors: { skills: "Your skill list didn't arrive intact. Reload and set it again." },
      formError: null,
    };
  }

  const parsed = freelancerProfileEditSchema.safeParse({
    displayName: str(formData, "displayName"),
    headline: str(formData, "headline"),
    bio: str(formData, "bio"),
    country: str(formData, "country"),
    timezone: str(formData, "timezone"),
    hourlyRateUsd: Number.isNaN(hourlyRateUsd) ? "not-a-number" : hourlyRateUsd,
    isOpenToWork: formData.get("isOpenToWork") === "on",
    skills,
    githubUrl: str(formData, "githubUrl"),
    portfolioUrl: str(formData, "portfolioUrl"),
    linkedinUrl: str(formData, "linkedinUrl"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, formError: "Some fields need fixing before this can save." };
  }

  const result = await updateFreelancerProfileForUser(user.id, parsed.data);
  if (result.ok) {
    // Changing the work links mid-review withdrew the submission; saying only
    // "saved" would leave them waiting on a review that is no longer queued.
    const notice = result.verificationWithdrawn
      ? "saved_withdrawn"
      : result.approvalCleared
        ? "saved_approval_cleared"
        : "saved";
    redirect(`${PAGE}?notice=${notice}`);
  }

  if (result.reason === "no-valid-skills") {
    return {
      fieldErrors: { skills: "Add at least one skill from the list before saving." },
      formError: null,
    };
  }
  if (result.reason === "no-profile") redirect("/onboarding/freelancer");
  // "wrong-role" is unreachable after requireRole; treat it as the retryable
  // failure it would be.
  return { fieldErrors: {}, formError: "That didn't save. Try again — nothing was changed." };
}

/**
 * Sets the profile photo. Its own action rather than part of the big save:
 * a photo change is its own gesture, and multipart upload failing must never
 * cost the person a page of unsaved text edits.
 */
export async function updateAvatar(formData: FormData): Promise<void> {
  const { user } = await requireRole("FREELANCER");
  const result = await setFreelancerAvatarForUser(user.id, formData.get("avatar"));
  redirect(`${PAGE}?notice=${result.ok ? "photo_saved" : "photo_failed"}`);
}
