"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import { createReportForUser } from "@/lib/services/report";
import { isPlausibleSlug } from "@/lib/services/slug";
import { reportSchema } from "@/lib/validations/report";

/**
 * The report Server Action. No page lives at /report — the control is a
 * disclosure on the job and company pages, and this is the only thing it posts
 * to.
 *
 * requireUser runs before anything reads the form, which is what a curl POST
 * meets: a logged-out caller is redirected to /signin and no row is written.
 * The service then re-validates and re-checks every limit, so nothing on the
 * form decides anything beyond which target is being named.
 */

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * Where the outcome is shown. Built from the target's type and slug rather than
 * from a returnTo the form carried: a caller-supplied redirect target is an
 * open redirect, and this flow only ever runs from two pages. An unusable slug
 * falls back to browse rather than trusting it into a URL.
 */
function pageFor(targetType: string, slug: string): string {
  if (!isPlausibleSlug(slug)) return "/jobs";
  return targetType === "company" ? `/companies/${slug}` : `/jobs/${slug}`;
}

const NOTICE_BY_REASON: Record<string, string> = {
  invalid: "report_invalid",
  "target-not-found": "report_gone",
  duplicate: "report_duplicate",
  "too-many-open": "report_limit",
};

export async function submitReport(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  const targetType = str(formData, "targetType");
  const page = pageFor(targetType, str(formData, "slug"));

  // A moderation queue is only useful if a human can still read it. Flooding
  // it is a denial of service against the safety team, not against a server.
  // Checked after `page` so the refusal can be SAID — an action that silently
  // does nothing teaches people to click it again.
  const limit = await checkRateLimit("report", user.id);
  if (!limit.allowed) redirect(`${page}?notice=report_too_fast`);

  const parsed = reportSchema.safeParse({
    targetType,
    targetId: str(formData, "targetId"),
    reason: str(formData, "reason"),
    details: str(formData, "details"),
  });
  if (!parsed.success) redirect(`${page}?notice=report_invalid`);

  const result = await createReportForUser(user.id, parsed.data);
  const notice = result.ok ? "reported" : (NOTICE_BY_REASON[result.reason] ?? "report_failed");
  redirect(`${page}?notice=${notice}`);
}
