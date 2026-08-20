"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import {
  closeJobForUser,
  createJobDraftForUser,
  publishJobForUser,
  updateJobDraftForUser,
  withdrawJobForUser,
  type JobActionFailure,
} from "@/lib/services/job";
import { jobPostSchema } from "@/lib/validations/job";

/**
 * Job posting Server Actions. requireRole runs first on every one — a curl
 * POST from a non-recruiter is refused before parsing. Outcomes travel as
 * validated notice codes on the dashboard URL, never free text.
 *
 * NOTE: a "use server" file may only export async functions (plus erased
 * types) — the initial form state object lives in job-form.tsx.
 */

export type JobFormState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
};

const DASHBOARD = "/dashboard/recruiter";

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

const numOrNull = (formData: FormData, key: string): number | string | null => {
  const raw = str(formData, key).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? "not-a-number" : n;
};

const failureRedirect = (failure: JobActionFailure): never => {
  if (failure.reason === "cap-reached") {
    redirect(`${DASHBOARD}?notice=cap_reached&cap=${failure.cap}&used=${failure.used}`);
  }
  if (failure.reason === "banned") redirect(`${DASHBOARD}?notice=banned`);
  if (failure.reason === "not-found" || failure.reason === "not-publishable") {
    redirect(`${DASHBOARD}?notice=not_found`);
  }
  redirect(`${DASHBOARD}?notice=publish_failed`);
};

export async function submitJob(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const { user } = await requireRole("RECRUITER");

  const parsed = jobPostSchema.safeParse({
    title: str(formData, "title"),
    description: str(formData, "description"),
    categorySlug: str(formData, "categorySlug"),
    engagementType: str(formData, "engagementType"),
    budgetMinUsd: numOrNull(formData, "budgetMinUsd"),
    budgetMaxUsd: numOrNull(formData, "budgetMaxUsd"),
    isRemote: formData.get("isRemote") === "on",
    location: str(formData, "location"),
    skillSlugs: formData.getAll("skillSlugs").filter((v): v is string => typeof v === "string"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, formError: "Please fix the highlighted fields." };
  }

  const intent = str(formData, "intent") === "publish" ? "publish" : "draft";
  const existingJobId = str(formData, "jobId") || null;

  let jobId: string;
  if (existingJobId) {
    const updated = await updateJobDraftForUser(user.id, existingJobId, parsed.data);
    if (!updated.ok) {
      if (updated.reason === "invalid-category") {
        return { fieldErrors: { categorySlug: "Pick a category from the list." }, formError: null };
      }
      if (updated.reason === "no-valid-skills") {
        return { fieldErrors: { skillSlugs: "Pick skills from the list." }, formError: null };
      }
      return failureRedirect(updated);
    }
    jobId = existingJobId;
  } else {
    const created = await createJobDraftForUser(user.id, parsed.data);
    if (!created.ok) {
      if (created.reason === "invalid-category") {
        return { fieldErrors: { categorySlug: "Pick a category from the list." }, formError: null };
      }
      if (created.reason === "no-valid-skills") {
        return { fieldErrors: { skillSlugs: "Pick skills from the list." }, formError: null };
      }
      return failureRedirect(created);
    }
    jobId = created.jobId;
  }

  if (intent === "draft") {
    redirect(`${DASHBOARD}?notice=${existingJobId ? "draft_updated" : "draft_saved"}`);
  }

  const published = await publishJobForUser(user.id, jobId);
  if (!published.ok) return failureRedirect(published);
  redirect(
    `${DASHBOARD}?notice=${published.status === "ACTIVE" ? "published" : "held_for_review"}`,
  );
}

export async function publishExistingJob(formData: FormData): Promise<void> {
  const { user } = await requireRole("RECRUITER");
  const jobId = str(formData, "jobId");
  if (!jobId) redirect(`${DASHBOARD}?notice=not_found`);

  const result = await publishJobForUser(user.id, jobId);
  if (!result.ok) return failureRedirect(result);
  redirect(`${DASHBOARD}?notice=${result.status === "ACTIVE" ? "published" : "held_for_review"}`);
}

export async function closeExistingJob(formData: FormData): Promise<void> {
  const { user } = await requireRole("RECRUITER");
  const jobId = str(formData, "jobId");
  if (!jobId) redirect(`${DASHBOARD}?notice=not_found`);

  const result = await closeJobForUser(user.id, jobId);
  if (!result.ok) return failureRedirect(result);
  redirect(`${DASHBOARD}?notice=closed`);
}

export async function withdrawHeldJob(formData: FormData): Promise<void> {
  const { user } = await requireRole("RECRUITER");
  const jobId = str(formData, "jobId");
  if (!jobId) redirect(`${DASHBOARD}?notice=not_found`);

  const result = await withdrawJobForUser(user.id, jobId);
  if (!result.ok) return failureRedirect(result);
  redirect(`${DASHBOARD}?notice=withdrawn`);
}
