"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import {
  banRecruiterAsAdmin,
  clearFlagAsAdmin,
  resolveReportAsAdmin,
  upholdFlagAsAdmin,
} from "@/lib/services/moderation";
import {
  approveVerification,
  rejectVerification,
} from "@/lib/services/recruiter-verification";
import { banReasonSchema, verificationNoteSchema } from "@/lib/validations/recruiter";

/**
 * Admin moderation actions. requireRole("ADMIN") runs first on every one, and
 * each service re-checks the role against the database — a curl POST from a
 * recruiter is refused twice over.
 */

const PAGE = "/admin";

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function clearFlag(formData: FormData): Promise<void> {
  const { user } = await requireRole("ADMIN");
  const result = await clearFlagAsAdmin(user.id, str(formData, "flagId"));
  if (!result.ok) redirect(`${PAGE}?notice=decision_failed`);
  redirect(`${PAGE}?notice=${result.jobPublished ? "flag_cleared_published" : "flag_cleared"}`);
}

export async function upholdFlag(formData: FormData): Promise<void> {
  const { user } = await requireRole("ADMIN");
  const result = await upholdFlagAsAdmin(user.id, str(formData, "flagId"));
  if (!result.ok) redirect(`${PAGE}?notice=decision_failed`);
  redirect(`${PAGE}?notice=flag_upheld`);
}

export async function banRecruiter(formData: FormData): Promise<void> {
  const { user } = await requireRole("ADMIN");
  const reason = banReasonSchema.safeParse(str(formData, "reason"));
  if (!reason.success) redirect(`${PAGE}?notice=ban_reason_invalid`);

  const result = await banRecruiterAsAdmin(user.id, str(formData, "recruiterId"), reason.data);
  if (!result.ok) redirect(`${PAGE}?notice=decision_failed`);
  redirect(`${PAGE}?notice=banned&jobs=${result.jobsRemoved}`);
}

export async function decideReport(formData: FormData): Promise<void> {
  const { user } = await requireRole("ADMIN");
  // Refuse an unrecognized decision rather than silently treating it as
  // "clear" — a tampered or malformed value must not resolve a report.
  const decision = str(formData, "decision");
  if (decision !== "UPHELD" && decision !== "CLEARED") {
    redirect(`${PAGE}?notice=decision_failed`);
  }
  const uphold = decision === "UPHELD";
  const result = await resolveReportAsAdmin(user.id, str(formData, "reportId"), decision);
  if (!result.ok) redirect(`${PAGE}?notice=decision_failed`);
  redirect(`${PAGE}?notice=${uphold ? "report_upheld" : "report_cleared"}`);
}

export async function approveRecruiterVerification(formData: FormData): Promise<void> {
  const { user } = await requireRole("ADMIN");
  const result = await approveVerification(user.id, str(formData, "recruiterId"));
  if (!result.ok) {
    redirect(
      `${PAGE}?notice=${result.reason === "requirements-unmet" ? "verify_unmet" : "decision_failed"}`,
    );
  }
  redirect(`${PAGE}?notice=verified`);
}

export async function rejectRecruiterVerification(formData: FormData): Promise<void> {
  const { user } = await requireRole("ADMIN");
  const note = verificationNoteSchema.safeParse(str(formData, "note"));
  if (!note.success) redirect(`${PAGE}?notice=verify_note_invalid`);

  const result = await rejectVerification(user.id, str(formData, "recruiterId"), note.data);
  if (!result.ok) redirect(`${PAGE}?notice=decision_failed`);
  redirect(`${PAGE}?notice=verify_rejected`);
}
