"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import {
  submitVerificationForUser,
  updateVerificationDetailsForUser,
} from "@/lib/services/recruiter-verification";
import { recruiterVerificationDetailsSchema } from "@/lib/validations/recruiter";

const PAGE = "/dashboard/recruiter/verification";

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function saveVerificationDetails(formData: FormData): Promise<void> {
  const { user } = await requireRole("RECRUITER");
  // Each submission puts an item in front of a human moderator.
  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);


  const parsed = recruiterVerificationDetailsSchema.safeParse({
    companyDomain: str(formData, "companyDomain"),
    registrationNo: str(formData, "registrationNo"),
    linkedinUrl: str(formData, "linkedinUrl"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.path[0];
    redirect(`${PAGE}?notice=details_invalid&field=${String(first ?? "form")}`);
  }

  const result = await updateVerificationDetailsForUser(user.id, parsed.data);
  if (result.ok) redirect(`${PAGE}?notice=details_saved`);
  if (result.reason === "already-verified") redirect(`${PAGE}?notice=already_verified`);
  if (result.reason === "banned") redirect(`/dashboard/recruiter?notice=banned`);
  redirect(`/dashboard/recruiter?notice=not_found`);
}

export async function submitVerification(): Promise<void> {
  const { user } = await requireRole("RECRUITER");
  // Each submission puts an item in front of a human moderator.
  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);

  const result = await submitVerificationForUser(user.id);

  if (result.ok) redirect(`${PAGE}?notice=submitted`);
  if (result.reason === "requirements-unmet") redirect(`${PAGE}?notice=requirements_unmet`);
  if (result.reason === "already-pending") redirect(`${PAGE}?notice=already_pending`);
  if (result.reason === "already-verified") redirect(`${PAGE}?notice=already_verified`);
  if (result.reason === "banned") redirect(`/dashboard/recruiter?notice=banned`);
  redirect(`/dashboard/recruiter?notice=not_found`);
}
