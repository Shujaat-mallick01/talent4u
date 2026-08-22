"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { sendMessageForUser, startConversationForUser } from "@/lib/services/message";
import { sendMessageSchema, startConversationSchema } from "@/lib/validations/message";

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
};

const noticeFor = (reason: string): string => NOTICE_BY_REASON[reason] ?? "failed";

/** Opens the thread for an application and posts its first message. */
export async function startConversation(formData: FormData): Promise<void> {
  const { user } = await requireUser();

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
