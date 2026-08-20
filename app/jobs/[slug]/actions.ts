"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { applyToJob } from "@/lib/services/application";
import { isPlausibleSlug } from "@/lib/services/slug";
import { applyToJobSchema } from "@/lib/validations/application";

/**
 * The apply Server Action. requireRole runs first — a curl POST from a
 * non-freelancer is refused before parsing — and the quota itself is enforced
 * inside the service's row-locked transaction, never here or in the UI.
 */

export type ApplyFormState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
  /** Set on a quota refusal so the form stops asserting a stale remaining count. */
  quotaExhausted?: boolean;
};

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function submitApplication(
  _prev: ApplyFormState,
  formData: FormData,
): Promise<ApplyFormState> {
  const { user } = await requireRole("FREELANCER");

  const slug = str(formData, "jobSlug");
  if (!isPlausibleSlug(slug)) {
    return { fieldErrors: {}, formError: "This job can't be applied to." };
  }

  const rawRate = str(formData, "proposedRateUsd").trim();
  const proposedRateUsd = rawRate === "" ? null : Number(rawRate);

  const parsed = applyToJobSchema.safeParse({
    coverLetter: str(formData, "coverLetter"),
    proposedRateUsd: Number.isNaN(proposedRateUsd) ? "not-a-number" : proposedRateUsd,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, formError: null };
  }

  const result = await applyToJob(user.id, slug, parsed.data);

  if (result.ok) {
    redirect(`/jobs/${slug}?notice=applied`);
  }

  if (result.reason === "already-applied") {
    redirect(`/jobs/${slug}?notice=already_applied`);
  }
  if (result.reason === "quota-exceeded") {
    return {
      fieldErrors: {},
      formError: `You've used all ${result.limit} of your free applications for this rolling 30-day period. A slot frees when an older application ages out — or Pro removes the limit entirely (billing launches soon).`,
      quotaExhausted: true,
    };
  }
  if (result.reason === "no-freelancer-profile") {
    redirect("/onboarding/freelancer");
  }
  if (result.reason === "job-not-available") {
    return { fieldErrors: {}, formError: "This job is no longer accepting applications." };
  }
  // "conflict" — a retryable lock-wait timeout.
  return { fieldErrors: {}, formError: "That didn't go through — please try again." };
}
