"use server";

import { redirect } from "next/navigation";

import { onProfileCreated } from "@/lib/services/notify";

import { requireRole } from "@/lib/auth/guards";
import { onboardFreelancer } from "@/lib/services/freelancer";
import { freelancerOnboardingSchema } from "@/lib/validations/freelancer";

/**
 * Server Action behind the freelancer onboarding form. requireRole runs first,
 * so a curl POST from a non-freelancer (or a logged-out caller) is turned away
 * before any parsing — the form is not the security boundary, this is.
 */

export type FreelancerOnboardingState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
};

// NOTE: a "use server" file may only export async functions (plus erased
// types) — the initial form state object lives in onboarding-form.tsx.

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function submitFreelancerOnboarding(
  _prev: FreelancerOnboardingState,
  formData: FormData,
): Promise<FreelancerOnboardingState> {
  const { user } = await requireRole("FREELANCER");

  // hourlyRate: blank → null; otherwise a number (Zod rejects non-integers).
  const rawRate = str(formData, "hourlyRateUsd").trim();
  const hourlyRateUsd = rawRate === "" ? null : Number(rawRate);

  // skills arrive as a JSON array from the picker's hidden input.
  let skills: unknown = [];
  try {
    const raw = str(formData, "skills");
    skills = raw ? JSON.parse(raw) : [];
  } catch {
    return { fieldErrors: { skills: "Something went wrong with your skill selection." }, formError: null };
  }

  const parsed = freelancerOnboardingSchema.safeParse({
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
    return { fieldErrors, formError: "Please fix the highlighted fields." };
  }

  const result = await onboardFreelancer(user.id, parsed.data);
  if (result.ok) {
    // Fire-and-forget, after the response. A mail outage must never be able to
    // fail an onboarding the database has already committed.
    onProfileCreated(user.email, parsed.data.displayName, "FREELANCER");
    redirect(`/dashboard/freelancer`);
  }

  if (result.reason === "no-valid-skills") {
    return { fieldErrors: { skills: "Choose at least one skill from the list." }, formError: null };
  }
  if (result.reason === "already-onboarded") {
    // A profile already exists for this account — send them onward.
    redirect(`/dashboard/freelancer`);
  }
  // "conflict" means retries were exhausted and no profile was created, and
  // "wrong-role" should be impossible after requireRole above — both are a
  // retryable failure, never a dashboard redirect (the user has no profile).
  return {
    fieldErrors: {},
    formError: "We couldn't create your profile. Please try again.",
  };
}
