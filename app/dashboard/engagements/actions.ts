"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import {
  amendEngagementTermsForUser,
  confirmEngagementForUser,
  declineEngagementForUser,
  proposeEngagementForUser,
  writeReviewForUser,
} from "@/lib/services/engagement";
import { engagementTermsSchema, proposeEngagementSchema } from "@/lib/validations/engagement";
import { writeReviewSchema } from "@/lib/validations/review";

/**
 * Engagement and review Server Actions.
 *
 * requireUser runs first on every one, and each service then re-resolves which
 * side of the engagement the caller is on from their own profile row. Nothing
 * here reads a party id, a side, or a rating subject off the form — a curl POST
 * can name an engagement, and that is all it can name.
 *
 * Outcomes travel as validated notice codes on the dashboard URL, never as
 * free text.
 */

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

const num = (formData: FormData, key: string): number => {
  const raw = str(formData, key).trim();
  // NaN fails the Zod schema and surfaces as terms_invalid; Number("") is 0,
  // which the positive() rule rejects for the same reason.
  return raw === "" ? Number.NaN : Number(raw);
};

/** Both dashboards render this flow, so outcomes go back where they came from. */
const pageFor = (role: string): string =>
  role === "RECRUITER"
    ? "/dashboard/recruiter/engagements"
    : "/dashboard/freelancer/engagements";

const NOTICE_BY_REASON: Record<string, string> = {
  "already-exists": "already_exists",
  "not-pending": "not_pending",
  "already-confirmed": "already_confirmed",
  "not-confirmed": "not_confirmed",
  "already-reviewed": "already_reviewed",
  "recruiter-banned": "recruiter_banned",
  "terms-missing": "terms_missing",
  "terms-changed": "terms_changed",
  banned: "recruiter_banned",
};

const noticeFor = (reason: string): string => NOTICE_BY_REASON[reason] ?? "failed";

export async function proposeEngagement(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const page = pageFor(user.role);

  // Each proposal mails the other party, so this is a send button with
  // somebody else's inbox on the end of it.
  const limit = await checkRateLimit("message", user.id);
  if (!limit.allowed) redirect(`${page}?notice=too_fast`);

  const parsed = proposeEngagementSchema.safeParse({
    applicationId: str(formData, "applicationId"),
    statedRateUsd: num(formData, "statedRateUsd"),
    durationWeeks: num(formData, "durationWeeks"),
  });
  if (!parsed.success) redirect(`${page}?notice=terms_invalid`);

  const result = await proposeEngagementForUser(user.id, parsed.data);
  redirect(`${page}?notice=${result.ok ? "proposed" : noticeFor(result.reason)}`);
}

export async function confirmEngagement(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const page = pageFor(user.role);

  // Bounded by the per-engagement uniques already, but every one of these
  // writes shared state and most of them mail the other party.
  const limit = await checkRateLimit("message", user.id);
  if (!limit.allowed) redirect(`${page}?notice=too_fast`);

  // The figures the page rendered travel with the click, so the service can
  // prove the party agreed to THESE terms and not to whatever the proposer
  // amended them to afterwards.
  const seen = engagementTermsSchema.safeParse({
    statedRateUsd: num(formData, "seenRateUsd"),
    durationWeeks: num(formData, "seenDurationWeeks"),
  });
  if (!seen.success) redirect(`${page}?notice=terms_changed`);

  const result = await confirmEngagementForUser(
    user.id,
    str(formData, "engagementId"),
    seen.data,
  );
  if (!result.ok) redirect(`${page}?notice=${noticeFor(result.reason)}`);
  redirect(`${page}?notice=${result.promotedToTrusted ? "confirmed_trusted" : "confirmed"}`);
}

export async function declineEngagement(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const page = pageFor(user.role);

  // Bounded by the per-engagement uniques already, but every one of these
  // writes shared state and most of them mail the other party.
  const limit = await checkRateLimit("message", user.id);
  if (!limit.allowed) redirect(`${page}?notice=too_fast`);

  const result = await declineEngagementForUser(user.id, str(formData, "engagementId"));
  redirect(`${page}?notice=${result.ok ? "declined" : noticeFor(result.reason)}`);
}

export async function amendEngagementTerms(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const page = pageFor(user.role);

  // Bounded by the per-engagement uniques already, but every one of these
  // writes shared state and most of them mail the other party.
  const limit = await checkRateLimit("message", user.id);
  if (!limit.allowed) redirect(`${page}?notice=too_fast`);

  const parsed = engagementTermsSchema.safeParse({
    statedRateUsd: num(formData, "statedRateUsd"),
    durationWeeks: num(formData, "durationWeeks"),
  });
  if (!parsed.success) redirect(`${page}?notice=terms_invalid`);

  const result = await amendEngagementTermsForUser(
    user.id,
    str(formData, "engagementId"),
    parsed.data,
  );
  redirect(`${page}?notice=${result.ok ? "amended" : noticeFor(result.reason)}`);
}

export async function writeReview(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const page = pageFor(user.role);

  // Bounded by the per-engagement uniques already, but every one of these
  // writes shared state and most of them mail the other party.
  const limit = await checkRateLimit("message", user.id);
  if (!limit.allowed) redirect(`${page}?notice=too_fast`);

  const parsed = writeReviewSchema.safeParse({
    engagementId: str(formData, "engagementId"),
    rating: str(formData, "rating"),
    body: str(formData, "body"),
  });
  if (!parsed.success) redirect(`${page}?notice=review_invalid`);

  const result = await writeReviewForUser(user.id, parsed.data);
  redirect(`${page}?notice=${result.ok ? "reviewed" : noticeFor(result.reason)}`);
}
