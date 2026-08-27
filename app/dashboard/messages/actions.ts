"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/services/rate-limit";
import {
  sendMessageForUser,
  startConversationForUser,
  startOutreachForUser,
} from "@/lib/services/message";
import {
  sendMessageSchema,
  startConversationSchema,
  startOutreachSchema,
} from "@/lib/validations/message";

/**
 * Messaging Server Actions.
 *
 * requireUser runs first on every one, and the service then re-resolves the
 * caller's standing and membership from the database. Nothing here reads a
 * recipient, a participant list, or a role off the form — a curl POST can name
 * an application or a conversation, and that is all it can name.
 */

const PAGE = "/dashboard/messages";

const str = (formData: FormData, key: string): string => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

const NOTICE_BY_REASON: Record<string, string> = {
  "not-found": "not_found",
  "not-a-participant": "not_found",
  "cannot-initiate": "cannot_initiate",
  "recruiter-banned": "recruiter_banned",
  banned: "recruiter_banned",
  "not-allowed": "not_allowed",
  "no-account": "not_allowed",
  "plan-required": "plan_required",
  "job-closed": "job_closed",
};

const noticeFor = (reason: string): string => NOTICE_BY_REASON[reason] ?? "failed";

/** Opens the thread for an application and posts its first message. */
export async function startConversation(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  // One bucket across replies and new threads: from the receiving end it is
  // all just messages arriving, and splitting the budget would let somebody
  // send twice as many by alternating between the two.
  const limit = await checkRateLimit("message", user.id);
  if (!limit.allowed) redirect(`${PAGE}?notice=too_fast`);

  const parsed = startConversationSchema.safeParse({
    applicationId: str(formData, "applicationId"),
    body: str(formData, "body"),
  });
  if (!parsed.success) {
    // Bounce back where they were, since the compose box lives on that page.
    const back = str(formData, "returnTo") || PAGE;
    redirect(`${back}?notice=message_empty`);
  }

  const result = await startConversationForUser(user.id, parsed.data);

  if (result.ok) {
    redirect(`${PAGE}/${result.conversationId}?notice=${result.flagged ? "sent_flagged" : "sent"}`);
  }
  // The thread already existed — take them into it rather than showing an error.
  if (result.reason === "already-exists" && result.conversationId) {
    redirect(`${PAGE}/${result.conversationId}`);
  }
  redirect(`${PAGE}?notice=${noticeFor(result.reason)}`);
}

/** Replies in an existing thread. */
export async function sendMessage(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const conversationId = str(formData, "conversationId");

  const limit = await checkRateLimit("message", user.id);
  if (!limit.allowed) redirect(`${PAGE}/${conversationId}?notice=too_fast`);

  const parsed = sendMessageSchema.safeParse({
    conversationId,
    body: str(formData, "body"),
  });
  if (!parsed.success) {
    redirect(`${PAGE}/${conversationId}?notice=message_empty`);
  }

  const result = await sendMessageForUser(user.id, parsed.data);
  if (!result.ok) redirect(`${PAGE}?notice=${noticeFor(result.reason)}`);
  redirect(`${PAGE}/${conversationId}?notice=${result.flagged ? "sent_flagged" : "sent"}`);
}

/**
 * Writes to a freelancer who has not applied, from candidate search.
 *
 * The form carries a freelancer id, one of the recruiter's own job ids, and
 * the message. It cannot name a recipient user, a conversation, or a
 * participant list — those are all derived server-side from the two ids, and
 * the job is looked up by owner, so a POST naming somebody else's job resolves
 * to nothing.
 */
export async function startOutreach(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const back = str(formData, "returnTo") || "/dashboard/recruiter/candidates";

  // Its own budget, and a daily one. This is the only path in the product that
  // puts a message in front of somebody who never asked for it, so the ceiling
  // is set where a real recruiter will never reach it and a bulk send will.
  const limit = await checkRateLimit("outreach", user.id);
  if (!limit.allowed) redirect(`${back}?notice=too_fast`);

  const parsed = startOutreachSchema.safeParse({
    freelancerId: str(formData, "freelancerId"),
    jobId: str(formData, "jobId"),
    body: str(formData, "body"),
  });
  if (!parsed.success) redirect(`${back}?notice=message_empty`);

  const result = await startOutreachForUser(user.id, parsed.data);

  if (result.ok) {
    redirect(`${PAGE}/${result.conversationId}?notice=${result.flagged ? "sent_flagged" : "sent"}`);
  }
  // Already written to this person about this role — open that thread rather
  // than reporting an error for something that is not one.
  if (result.reason === "already-exists" && result.conversationId) {
    redirect(`${PAGE}/${result.conversationId}`);
  }
  redirect(`${back}?notice=${noticeFor(result.reason)}`);
}
