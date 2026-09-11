"use server";

import { redirect } from "next/navigation";

import { onProfileCreated } from "@/lib/services/notify";

import { requireRole } from "@/lib/auth/guards";
import { onboardRecruiter } from "@/lib/services/recruiter";
import { recruiterOnboardingSchema, validateLogo } from "@/lib/validations/recruiter";
import { safetyReasonPhrase } from "@/lib/services/profile-safety";

/**
 * Server Action behind the recruiter onboarding form. requireRole runs first,
 * so a curl POST from a non-recruiter or a logged-out caller is refused before
 * any parsing — the form is not the security boundary.
 */

export type RecruiterOnboardingState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
};

// NOTE: a "use server" file may only export async functions (plus erased
// types) — the initial form state object lives in onboarding-form.tsx.

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function submitRecruiterOnboarding(
  _prev: RecruiterOnboardingState,
  formData: FormData,
): Promise<RecruiterOnboardingState> {
  const { user } = await requireRole("RECRUITER");

  const parsed = recruiterOnboardingSchema.safeParse({
    companyName: str(formData, "companyName"),
    companyDomain: str(formData, "companyDomain"),
    registrationNo: str(formData, "registrationNo"),
    linkedinUrl: str(formData, "linkedinUrl"),
    websiteUrl: str(formData, "websiteUrl"),
    description: str(formData, "description"),
    country: str(formData, "country"),
  });

  const logo = validateLogo(formData.get("logo"));

  if (!parsed.success || !logo.ok) {
    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
    }
    if (!logo.ok) fieldErrors.logo = logo.message;
    return { fieldErrors, formError: "Please fix the highlighted fields." };
  }

  const result = await onboardRecruiter(user.id, parsed.data, logo.file);
  if (result.ok) {
    onProfileCreated(user.email, parsed.data.companyName, "RECRUITER");
    redirect(`/dashboard/recruiter`);
  }

  if (result.reason === "flagged") {
    return {
      fieldErrors: {
        [result.flag.field]: `This reads as ${safetyReasonPhrase(result.flag.match.reason)} ("${result.flag.match.matchedTerm}"). Freelancers never pay to work here, so we cannot publish that. Reword it to continue.`,
      },
      formError: "Please fix the highlighted field.",
    };
  }
  if (result.reason === "logo-failed") {
    return { fieldErrors: { logo: result.message ?? "Logo upload failed." }, formError: null };
  }
  if (result.reason === "already-onboarded") {
    redirect(`/dashboard/recruiter`);
  }
  // "conflict" (retries exhausted, no profile) or "wrong-role" (impossible
  // after requireRole) — retryable failure, never a dashboard redirect.
  return {
    fieldErrors: {},
    formError: "We couldn't create your company profile. Please try again.",
  };
}
