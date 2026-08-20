import {
  countDistinctConfirmedFreelancers,
  getRecruiterTier,
  getRecruiterTierAndFlags,
  getVerificationStateForUser,
  markVerificationSubmitted,
  recordVerificationRejection,
  setRecruiterTier,
  updateVerificationDetails,
} from "@/lib/db/verification";
import { getUserAuthState } from "@/lib/db/users";
import type { RecruiterVerificationDetailsInput } from "@/lib/validations/recruiter";

import { qualifiesForTrusted, verificationReadiness } from "./verification";

/**
 * Verification orchestration. The pure rules live in ./verification; this
 * layer reads the database, re-checks the caller's standing, and writes.
 *
 * Two promotion paths, deliberately different:
 *   UNVERIFIED -> VERIFIED : a HUMAN admin decision. "LinkedIn match" cannot
 *                            be machine-checked, so submission only queues.
 *   VERIFIED  -> TRUSTED   : automatic, on reaching 3 distinct mutually
 *                            confirmed engagements.
 */

export type SubmitVerificationResult =
  | { ok: true }
  | { ok: false; reason: "no-recruiter-profile" | "banned" | "already-verified" | "already-pending" }
  | { ok: false; reason: "requirements-unmet"; missing: string[] };

export async function submitVerificationForUser(
  userId: string,
): Promise<SubmitVerificationResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "RECRUITER") return { ok: false, reason: "no-recruiter-profile" };

  const profile = await getVerificationStateForUser(userId);
  if (!profile) return { ok: false, reason: "no-recruiter-profile" };
  if (profile.isBanned) return { ok: false, reason: "banned" };
  if (profile.tier !== "UNVERIFIED") return { ok: false, reason: "already-verified" };
  if (profile.verificationSubmittedAt) return { ok: false, reason: "already-pending" };

  // Re-check the requirements server-side against the confirmed account email.
  const readiness = verificationReadiness({
    accountEmail: account.email,
    accountEmailVerified: profile.user.emailVerified !== null,
    companyDomain: profile.companyDomain,
    registrationNo: profile.registrationNo,
    linkedinUrl: profile.linkedinUrl,
  });
  if (!readiness.ready) {
    return {
      ok: false,
      reason: "requirements-unmet",
      missing: readiness.requirements.filter((r) => !r.met).map((r) => r.key),
    };
  }

  await markVerificationSubmitted(profile.id);
  return { ok: true };
}

export type UpdateDetailsResult =
  | { ok: true }
  | { ok: false; reason: "no-recruiter-profile" | "banned" | "already-verified" };

/**
 * Edits the three VERIFIED evidence fields. They are optional at onboarding,
 * so without this a recruiter who skipped them — or whose submission was
 * returned — could never reach VERIFIED.
 *
 * Refused once the badge is granted: evidence must not be swapped underneath
 * an approved tier. Editing also pulls any pending submission back out of the
 * queue so a reviewer never judges stale evidence.
 */
export async function updateVerificationDetailsForUser(
  userId: string,
  input: RecruiterVerificationDetailsInput,
): Promise<UpdateDetailsResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "RECRUITER") return { ok: false, reason: "no-recruiter-profile" };

  const profile = await getVerificationStateForUser(userId);
  if (!profile) return { ok: false, reason: "no-recruiter-profile" };
  if (profile.isBanned) return { ok: false, reason: "banned" };
  if (profile.tier !== "UNVERIFIED") return { ok: false, reason: "already-verified" };

  await updateVerificationDetails(profile.id, {
    companyDomain: input.companyDomain,
    registrationNo: input.registrationNo,
    linkedinUrl: input.linkedinUrl,
  });
  return { ok: true };
}

export type AdminDecisionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-admin" | "not-found" | "not-pending" | "banned" | "requirements-unmet";
    };

async function requireAdmin(userId: string): Promise<boolean> {
  const account = await getUserAuthState(userId);
  return account?.role === "ADMIN";
}

/**
 * Admin approves a pending submission: UNVERIFIED -> VERIFIED, with the tier
 * fanned out to the recruiter's jobs. Then immediately evaluates TRUSTED —
 * a recruiter may already have the engagements when approval lands.
 */
export async function approveVerification(
  adminUserId: string,
  recruiterId: string,
): Promise<AdminDecisionResult> {
  if (!(await requireAdmin(adminUserId))) return { ok: false, reason: "not-admin" };

  const profile = await getRecruiterTierAndFlags(recruiterId);
  if (!profile) return { ok: false, reason: "not-found" };
  if (profile.isBanned) return { ok: false, reason: "banned" };
  if (profile.tier !== "UNVERIFIED") return { ok: false, reason: "not-pending" };
  // Only a recruiter who actually submitted may be approved — otherwise a
  // mis-typed id could mint a badge for an untouched company.
  if (!profile.verificationSubmittedAt) return { ok: false, reason: "not-pending" };

  // Evidence is editable (updateVerificationDetailsForUser), so re-check the
  // requirements at decision time rather than trusting them from submission.
  const readiness = verificationReadiness({
    accountEmail: profile.user.email,
    accountEmailVerified: profile.user.emailVerified !== null,
    companyDomain: profile.companyDomain,
    registrationNo: profile.registrationNo,
    linkedinUrl: profile.linkedinUrl,
  });
  if (!readiness.ready) return { ok: false, reason: "requirements-unmet" };

  await setRecruiterTier({
    recruiterId,
    tier: "VERIFIED",
    verifiedAt: new Date(),
    verificationSubmittedAt: null,
    verificationNote: null,
  });

  await evaluateTrustedPromotion(recruiterId);
  return { ok: true };
}

/** Admin rejects: stays UNVERIFIED, keeps the reason, clears the queue entry. */
export async function rejectVerification(
  adminUserId: string,
  recruiterId: string,
  note: string,
): Promise<AdminDecisionResult> {
  if (!(await requireAdmin(adminUserId))) return { ok: false, reason: "not-admin" };

  const profile = await getRecruiterTierAndFlags(recruiterId);
  if (!profile) return { ok: false, reason: "not-found" };
  if (profile.tier !== "UNVERIFIED" || !profile.verificationSubmittedAt) {
    return { ok: false, reason: "not-pending" };
  }

  // The tier does not change, so this writes the queue fields only — no
  // pointless fan-out rewriting every job row.
  await recordVerificationRejection(recruiterId, note);
  return { ok: true };
}

/**
 * Automatic VERIFIED -> TRUSTED at 3 distinct confirmed engagements. Called
 * after every engagement confirmation (Session 4.4) and after approval.
 * Idempotent: re-running on an already-TRUSTED recruiter is a no-op, and it
 * never promotes an UNVERIFIED recruiter.
 */
export async function evaluateTrustedPromotion(recruiterId: string): Promise<boolean> {
  const tier = await getRecruiterTier(recruiterId);
  if (tier !== "VERIFIED") return false;

  const distinct = await countDistinctConfirmedFreelancers(recruiterId);
  if (!qualifiesForTrusted(tier, distinct)) return false;

  await setRecruiterTier({ recruiterId, tier: "TRUSTED" });
  return true;
}
