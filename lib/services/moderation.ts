import {
  banRecruiterTx,
  clearFlagTx,
  getSafetyFlagJobId,
  upholdFlagTx,
  resolveReport,
  type BanResult,
  type FlagDecisionResult,
} from "@/lib/db/moderation";
import { getUserAuthState } from "@/lib/db/users";

import { onJobPublishedAfterReview } from "./notify";

/**
 * Moderation orchestration. Every entry point re-establishes that the caller
 * is an ADMIN from the database — the /admin route guard is the first wall,
 * this is the second. ADMIN accounts exist only via seed or manual SQL, so
 * there is no path by which a user grants themselves one.
 */

export type ModerationFailure = { ok: false; reason: "not-admin" };

async function isAdmin(userId: string): Promise<boolean> {
  const account = await getUserAuthState(userId);
  return account?.role === "ADMIN";
}

export async function clearFlagAsAdmin(
  adminUserId: string,
  flagId: string,
): Promise<FlagDecisionResult | ModerationFailure> {
  if (!(await isAdmin(adminUserId))) return { ok: false, reason: "not-admin" };

  const flag = await getSafetyFlagJobId(flagId);
  const result = await clearFlagTx(flagId, adminUserId);
  // Clearing the last flag is the moment a held post goes live. The recruiter
  // has been waiting on a human since publish, so they are told it landed.
  if (result.ok && result.jobPublished && flag) onJobPublishedAfterReview(flag);
  return result;
}

export async function upholdFlagAsAdmin(
  adminUserId: string,
  flagId: string,
): Promise<FlagDecisionResult | ModerationFailure> {
  if (!(await isAdmin(adminUserId))) return { ok: false, reason: "not-admin" };
  return upholdFlagTx(flagId, adminUserId);
}

export async function banRecruiterAsAdmin(
  adminUserId: string,
  recruiterId: string,
  reason: string,
): Promise<BanResult | ModerationFailure> {
  if (!(await isAdmin(adminUserId))) return { ok: false, reason: "not-admin" };
  return banRecruiterTx({ recruiterId, reason, adminUserId });
}

export async function resolveReportAsAdmin(
  adminUserId: string,
  reportId: string,
  status: "CLEARED" | "UPHELD",
): Promise<{ ok: boolean; reason?: "not-admin" | "not-open" }> {
  if (!(await isAdmin(adminUserId))) return { ok: false, reason: "not-admin" };
  const done = await resolveReport(reportId, status);
  return done ? { ok: true } : { ok: false, reason: "not-open" };
}
