"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import { submitFreelancerVerification } from "@/lib/services/freelancer-verification";

/**
 * The freelancer's own verification action. requireRole runs first and the
 * service re-checks the role, the profile, and the links against the database
 * — a curl POST from a signed-out browser or another role is refused twice.
 */

const PAGE = "/dashboard/freelancer/verification";

export async function sendWorkLinksForReview(): Promise<void> {
  const { user } = await requireRole("FREELANCER");
  // Each submission puts an item in front of a human moderator.
  const rateLimit = await checkRateLimit("profile-write", user.id);
  if (!rateLimit.allowed) redirect(`${PAGE}?notice=too_fast`);

  const result = await submitFreelancerVerification(user.id);

  if (result.ok) redirect(`${PAGE}?notice=submitted`);

  switch (result.reason) {
    case "no-work-links":
      redirect(`${PAGE}?notice=no_work_links`);
    case "already-pending":
      redirect(`${PAGE}?notice=already_pending`);
    case "already-reviewed":
      redirect(`${PAGE}?notice=already_reviewed`);
    case "already-verified":
      redirect(`${PAGE}?notice=already_verified`);
    case "deactivated":
      redirect(`${PAGE}?notice=deactivated`);
    case "no-freelancer-profile":
      redirect("/onboarding/freelancer");
    default:
      redirect(`${PAGE}?notice=failed`);
  }
}
