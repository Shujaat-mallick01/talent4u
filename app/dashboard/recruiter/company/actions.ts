"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import {
  setCompanyLogoForUser,
  updateCompanyProfileForUser,
} from "@/lib/services/profile-edit";
import { companyProfileEditSchema } from "@/lib/validations/profile-edit";

/**
 * Server Action behind the company editor. requireRole runs before any
 * parsing, and the service looks the company up by the caller's own user id,
 * so a POST aimed at another company's row has nothing to aim with.
 *
 * companyDomain, registrationNo and linkedinUrl are absent from the schema, so
 * a hand-rolled POST that includes them has them stripped rather than honoured:
 * verification evidence is changed at /dashboard/recruiter/verification, and
 * only while the company is still UNVERIFIED.
 */

export type CompanyEditState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
};

const PAGE = "/dashboard/recruiter/company";

// NOTE: a "use server" file may only export async functions (plus erased
// types) — the initial form state object lives in edit-form.tsx.

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function saveCompanyProfile(
  _prev: CompanyEditState,
  formData: FormData,
): Promise<CompanyEditState> {
  const { user } = await requireRole("RECRUITER");

  const parsed = companyProfileEditSchema.safeParse({
    companyName: str(formData, "companyName"),
    websiteUrl: str(formData, "websiteUrl"),
    description: str(formData, "description"),
    country: str(formData, "country"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, formError: "Some fields need fixing before this can save." };
  }

  const result = await updateCompanyProfileForUser(user.id, parsed.data);
  if (result.ok) redirect(`${PAGE}?notice=saved`);

  if (result.reason === "banned") redirect(`${PAGE}?notice=banned`);
  if (result.reason === "no-profile") redirect("/onboarding/recruiter");
  // "wrong-role" is unreachable after requireRole; treat it as the retryable
  // failure it would be.
  return { fieldErrors: {}, formError: "That didn't save. Try again — nothing was changed." };
}

/** Sets the company logo — the change onboarding never allowed afterwards. */
export async function updateLogo(formData: FormData): Promise<void> {
  const { user } = await requireRole("RECRUITER");
  const result = await setCompanyLogoForUser(user.id, formData.get("logo"));
  redirect(`${PAGE}?notice=${result.ok ? "photo_saved" : "photo_failed"}`);
}
