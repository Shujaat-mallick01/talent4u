import type { FreelancerVerification } from "@/lib/generated/prisma/enums";
import {
  claimFreelancerVerificationDecision,
  getFreelancerVerificationById,
  getFreelancerVerificationStateForUser,
  markFreelancerVerificationSubmitted,
} from "@/lib/db/freelancer-verification";
import { getUserAuthState } from "@/lib/db/users";
import {
  isApprovalMarker,
  WORK_LINKS_APPROVED_NOTE,
} from "@/lib/validations/freelancer-verification";

/**
 * Freelancer verification — the half of it that can honestly ship.
 *
 * CLAUDE.md: "Government ID (Persona/Onfido) + at least one linked proof of
 * work". There is no ID provider in this sprint and no dependency may be added
 * for one, so only the proof-of-work half is reviewable.
 *
 * That leaves a problem worth stating plainly, because the obvious shortcut is
 * wrong: neither badge level is available to a work-only review. ID_VERIFIED
 * reads "Government ID confirmed" and ID_AND_WORK_VERIFIED claims both — a
 * work-link review has confirmed no ID, so writing either would put a claim on
 * a public profile that nothing backs. The database refuses to help either
 * way: constraints.sql pins (verification = 'NONE') = (verifiedAt IS NULL), so
 * there is no level to move to without a timestamp that would mean an ID check
 * happened.
 *
 * So this sprint: the badge does not move. A review is recorded in
 * verificationNote as a canonical marker, the freelancer's page shows "work
 * links reviewed — ID verification coming soon", and it says outright that the
 * visible badge changes only once ID verification launches. Nobody is told
 * they are verified. When Persona lands, the marker is the set of profiles
 * whose links are already done.
 *
 * Two layers, like recruiter verification: pure rules first (unit-tested, no
 * database), then orchestration that re-reads the caller's standing and writes.
 */

// ── Pure rules ─────────────────────────────────────────────────────────────

export type WorkLinkKey = "githubUrl" | "portfolioUrl" | "linkedinUrl";

export type WorkLink = {
  key: WorkLinkKey;
  label: string;
  /** The URL on the profile, or null when it is not set. */
  url: string | null;
  met: boolean;
  hint: string;
};

export type WorkLinkInput = {
  githubUrl: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
};

const present = (v: string | null): boolean => (v ?? "").trim().length > 0;

/**
 * The three proof-of-work links, in the order the page lists them.
 *
 * CLAUDE.md names Behance among the accepted proofs; the schema has no column
 * for it, so a Behance page is a portfolio URL. The hint says so rather than
 * leaving someone hunting for a field that does not exist.
 */
export function workLinks(input: WorkLinkInput): WorkLink[] {
  return [
    {
      key: "githubUrl",
      label: "GitHub",
      url: input.githubUrl,
      met: present(input.githubUrl),
      hint: "A profile with commits a reviewer can open. Public repositories only.",
    },
    {
      key: "portfolioUrl",
      label: "Portfolio or Behance",
      url: input.portfolioUrl,
      met: present(input.portfolioUrl),
      hint: "Your own domain, a Behance page, or anywhere your finished work is published.",
    },
    {
      key: "linkedinUrl",
      label: "LinkedIn",
      url: input.linkedinUrl,
      met: present(input.linkedinUrl),
      hint: "A profile whose history a reviewer can match to the work you list here.",
    },
  ];
}

export type WorkLinkReadiness = {
  links: WorkLink[];
  count: number;
  /** At least one proof of work — the bar CLAUDE.md sets. */
  ready: boolean;
};

/** Which proofs of work this profile carries. Presentation reads this;
 *  submission and approval both enforce it. */
export function workLinkReadiness(input: WorkLinkInput): WorkLinkReadiness {
  const links = workLinks(input);
  const count = links.filter((l) => l.met).length;
  return { links, count, ready: count > 0 };
}

/**
 * Where a profile stands in the flow. One name per screen state so the page
 * never re-derives the rules from four nullable columns.
 */
export type FreelancerVerificationStage =
  /** Nothing to review yet — no proof of work is linked. */
  | "NO_LINKS"
  /** Has at least one link and nothing in flight: may submit. */
  | "READY"
  /** A reviewer sent it back with a reason. May fix and submit again. */
  | "RETURNED"
  /** In the queue, waiting on a human. */
  | "PENDING"
  /** Links reviewed and accepted. The badge still waits on ID verification. */
  | "WORK_REVIEWED"
  /** The enum actually moved — reachable only once ID verification ships. */
  | "ID_VERIFIED";

export type StageInput = WorkLinkInput & {
  verification: FreelancerVerification;
  verificationSubmittedAt: Date | null;
  verificationNote: string | null;
};

export function freelancerVerificationStage(input: StageInput): FreelancerVerificationStage {
  // Whatever else is on the row, a real level outranks it. This flow never
  // writes one; it exists so the page is already correct on the day one does.
  if (input.verification !== "NONE") return "ID_VERIFIED";
  if (input.verificationSubmittedAt !== null) return "PENDING";
  if (isApprovalMarker(input.verificationNote)) return "WORK_REVIEWED";
  // Ordered by what the person can DO next: with no links, adding one is the
  // only move, and the reviewer's note is shown alongside either way.
  if (!workLinkReadiness(input).ready) return "NO_LINKS";
  if ((input.verificationNote ?? "").trim().length > 0) return "RETURNED";
  return "READY";
}

/** The two stages a submit button may appear in. Cosmetic — the service decides. */
export function canSubmitWorkVerification(stage: FreelancerVerificationStage): boolean {
  return stage === "READY" || stage === "RETURNED";
}

// ── Orchestration ──────────────────────────────────────────────────────────

export type SubmitFreelancerVerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no-freelancer-profile"
        | "deactivated"
        | "already-verified"
        | "already-reviewed"
        | "already-pending"
        | "no-work-links";
    };

/**
 * Queues a profile for work-link review.
 *
 * Every gate is re-checked here against the database rather than trusted from
 * the page that rendered the button — the UI is cosmetic, the caller is curl.
 */
export async function submitFreelancerVerification(
  userId: string,
): Promise<SubmitFreelancerVerificationResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "FREELANCER") {
    return { ok: false, reason: "no-freelancer-profile" };
  }

  const profile = await getFreelancerVerificationStateForUser(userId);
  if (!profile) return { ok: false, reason: "no-freelancer-profile" };
  // A profile the person took down has no public page for a badge to appear
  // on, so there is nothing for a reviewer to decide.
  if (profile.deactivatedAt !== null) return { ok: false, reason: "deactivated" };
  if (profile.verification !== "NONE") return { ok: false, reason: "already-verified" };
  if (profile.verificationSubmittedAt !== null) return { ok: false, reason: "already-pending" };
  if (isApprovalMarker(profile.verificationNote)) return { ok: false, reason: "already-reviewed" };
  // The links live on the profile editor, so they can have changed since the
  // page was rendered. This is the check that counts.
  if (!workLinkReadiness(profile).ready) return { ok: false, reason: "no-work-links" };

  await markFreelancerVerificationSubmitted(profile.id);
  return { ok: true };
}

export type FreelancerDecisionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-admin" | "not-found" | "not-pending" | "deactivated" | "no-work-links" | "reserved-note";
    };

async function requireAdmin(userId: string): Promise<boolean> {
  const account = await getUserAuthState(userId);
  return account?.role === "ADMIN";
}

/**
 * Approves the work-link half.
 *
 * Records the canonical marker and clears the queue entry. It writes NOTHING
 * else: no level, no verifiedAt, no public badge. See the header — an approval
 * here has confirmed links, not a person, and the copy on both the profile and
 * this record says exactly that much and no more.
 */
export async function approveFreelancerWorkLinks(
  adminUserId: string,
  freelancerId: string,
): Promise<FreelancerDecisionResult> {
  if (!(await requireAdmin(adminUserId))) return { ok: false, reason: "not-admin" };

  const profile = await getFreelancerVerificationById(freelancerId);
  if (!profile) return { ok: false, reason: "not-found" };
  if (profile.deactivatedAt !== null) return { ok: false, reason: "deactivated" };
  // Only a profile that actually submitted may be decided — otherwise a
  // mistyped id marks an untouched profile as reviewed.
  if (profile.verificationSubmittedAt === null) return { ok: false, reason: "not-pending" };
  // Links are editable while the submission sits in the queue, so re-check
  // them at decision time rather than trusting them from submission.
  if (!workLinkReadiness(profile).ready) return { ok: false, reason: "no-work-links" };

  const claimed = await claimFreelancerVerificationDecision(
    freelancerId,
    WORK_LINKS_APPROVED_NOTE,
    profile.verificationSubmittedAt,
  );
  if (!claimed) return { ok: false, reason: "not-pending" };
  return { ok: true };
}

/**
 * Returns a submission with a reason. The note is what the freelancer sees, so
 * it is the whole point of a rejection.
 *
 * The reserved-prefix refusal is repeated from the Zod schema on purpose: the
 * page tells an approval from a rejection by that prefix, and a note is the
 * only admin-authored free text in this flow that can change what a stored row
 * means.
 */
export async function rejectFreelancerWorkLinks(
  adminUserId: string,
  freelancerId: string,
  note: string,
): Promise<FreelancerDecisionResult> {
  if (!(await requireAdmin(adminUserId))) return { ok: false, reason: "not-admin" };
  if (isApprovalMarker(note)) return { ok: false, reason: "reserved-note" };

  const profile = await getFreelancerVerificationById(freelancerId);
  if (!profile) return { ok: false, reason: "not-found" };
  if (profile.deactivatedAt !== null) return { ok: false, reason: "deactivated" };
  if (profile.verificationSubmittedAt === null) return { ok: false, reason: "not-pending" };

  const claimed = await claimFreelancerVerificationDecision(
    freelancerId,
    note,
    profile.verificationSubmittedAt,
  );
  if (!claimed) return { ok: false, reason: "not-pending" };
  return { ok: true };
}
