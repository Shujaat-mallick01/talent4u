"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { getFreelancerProfileByUserId } from "@/lib/db/users";
import { saveJob, unsaveJob } from "@/lib/db/saved-job";
import { sanitizeNextPath } from "@/lib/validations/auth";

/**
 * The save/unsave toggle. Freelancer-only — a bookmark hangs off the
 * freelancer profile, which is also what scopes it: the profile is looked up
 * by the caller's own userId, so there is no id to forge.
 *
 * returnTo goes through sanitizeNextPath — the same open-redirect guard the
 * auth flow uses — because it round-trips through the client.
 */

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

async function toggle(formData: FormData, save: boolean): Promise<void> {
  const { user } = await requireRole("FREELANCER");
  const profile = await getFreelancerProfileByUserId(user.id);
  if (!profile) redirect("/onboarding/freelancer");

  const jobId = str(formData, "jobId");
  if (save) {
    await saveJob(profile.id, jobId);
  } else {
    await unsaveJob(profile.id, jobId);
  }

  const back = sanitizeNextPath(str(formData, "returnTo")) ?? "/dashboard/saved";
  redirect(back);
}

export async function saveJobAction(formData: FormData): Promise<void> {
  await toggle(formData, true);
}

export async function unsaveJobAction(formData: FormData): Promise<void> {
  await toggle(formData, false);
}
