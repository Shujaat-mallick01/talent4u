import {
  findConversationIdForApplication,
  getConversationForUser,
  listConversationsForUser,
  markConversationRead,
  sendMessageTx,
  startConversationTx,
  type ConversationThread,
} from "@/lib/db/message";
import { getEntitlementContext } from "@/lib/db/users";
import { getApplicationParties } from "@/lib/db/engagement";
import { getEntitlements } from "@/lib/pricing/entitlements";
import type { SendMessageInput, StartConversationInput } from "@/lib/validations/message";

import { scanMessageOnWrite } from "./message-safety";

/**
 * Messaging orchestration.
 *
 * The rules this enforces, all from CLAUDE.md:
 *
 *  - "UNVERIFIED … Cannot initiate messages." A company we have not verified
 *    may REPLY to anyone who writes to them, but cannot open a thread. That
 *    asymmetry is deliberate: it means an unverified company can still do
 *    business with someone who chose to contact them, while never being able
 *    to cold-open a conversation on the strength of a name we have not checked.
 *  - Free recruiters get "basic messaging" — replying to their own applicants.
 *    "Outbound messaging" (contacting someone who has not applied) is behind
 *    the paid wall, and is not reachable at all yet because candidate search
 *    does not exist.
 *  - "Enforce anti-circumvention" is explicitly something we DO NOT do. No
 *    path here inspects a message for contact details, and none ever should.
 *    The scanner looks for upfront-payment demands, not for email addresses.
 *  - A banned employer takes no new action anywhere.
 *
 * Threads are derived from an application, exactly like engagements: a caller
 * names an application it is already party to, and both participants are
 * resolved server-side. Nothing accepts a recipient id.
 */

export type MessagingViewer = {
  userId: string;
  role: "FREELANCER" | "RECRUITER";
  /** Recruiters only. Null for freelancers. */
  canInitiate: boolean;
};

export type ViewerFailure = { ok: false; reason: "no-account" | "banned" | "not-allowed" };

async function resolveViewer(
  userId: string,
): Promise<{ ok: true; viewer: MessagingViewer } | ViewerFailure> {
  const context = await getEntitlementContext(userId);
  if (!context) return { ok: false, reason: "no-account" };
  if (context.role !== "FREELANCER" && context.role !== "RECRUITER") {
    // An admin has no side in anyone's conversation. Moderation reads flagged
    // messages through the admin queue, not by joining threads.
    return { ok: false, reason: "not-allowed" };
  }

  const entitlements = getEntitlements({
    role: context.role,
    plan: context.plan,
    recruiterTier: context.recruiterTier,
  });

  // A removed employer takes no new action anywhere — including replying in a
  // thread they were already part of.
  if (context.isBanned) return { ok: false, reason: "banned" };

  return {
    ok: true,
    viewer: {
      userId,
      role: context.role,
      // A freelancer may always open a thread with a company they applied to.
      // A recruiter needs the verification tier that CLAUDE.md attaches this to.
      canInitiate: context.role === "FREELANCER" || entitlements.recruiter.initiateMessages,
    },
  };
}

// ── Reading ────────────────────────────────────────────────────────────────

export type InboxResult =
  | { ok: true; conversations: Awaited<ReturnType<typeof listConversationsForUser>> }
  | ViewerFailure;

export async function getInboxForUser(userId: string): Promise<InboxResult> {
  const resolved = await resolveViewer(userId);
  if (!resolved.ok) return resolved;
  return { ok: true, conversations: await listConversationsForUser(userId) };
}

export type ThreadResult =
  | { ok: true; thread: ConversationThread; viewer: MessagingViewer }
  | { ok: false; reason: "no-account" | "banned" | "not-allowed" | "not-found" };

/**
 * Opens a thread and marks it read.
 *
 * Marking read here rather than on an explicit action is the right trade:
 * the alternative is an unread badge that never clears until someone finds a
 * button, and the read receipt is not shown to the other party, so nothing
 * is asserted about them having actually read it.
 */
export async function getThreadForUser(userId: string, conversationId: string): Promise<ThreadResult> {
  const resolved = await resolveViewer(userId);
  if (!resolved.ok) return resolved;

  const thread = await getConversationForUser(conversationId, userId);
  if (!thread) return { ok: false, reason: "not-found" };

  await markConversationRead(conversationId, userId);
  return { ok: true, thread, viewer: resolved.viewer };
}

// ── Writing ────────────────────────────────────────────────────────────────

export type StartConversationResult =
  | { ok: true; conversationId: string; flagged: boolean }
  | {
      ok: false;
      reason:
        | "no-account"
        | "banned"
        | "not-allowed"
        | "not-found"
        | "cannot-initiate"
        | "recruiter-banned"
        | "already-exists";
      /** Set on already-exists so the caller can route to the live thread. */
      conversationId?: string;
    };

/**
 * Opens the thread for an application and posts the first message.
 */
export async function startConversationForUser(
  userId: string,
  input: StartConversationInput,
): Promise<StartConversationResult> {
  const resolved = await resolveViewer(userId);
  if (!resolved.ok) return resolved;
  const { viewer } = resolved;

  const application = await getApplicationParties(input.applicationId);
  if (!application) return { ok: false, reason: "not-found" };

  const { job } = application;
  const freelancerUserId = application.freelancer.userId;
  const recruiterUserId = job.recruiter.userId;

  // Party check: the caller must be one of the two people on this application.
  const isParty = userId === freelancerUserId || userId === recruiterUserId;
  if (!isParty) return { ok: false, reason: "not-found" };

  // A removed employer neither writes nor receives.
  if (job.recruiter.isBanned) return { ok: false, reason: "recruiter-banned" };

  // The CLAUDE.md tier rule. Checked here, not in the UI: the button is hidden
  // for an unverified company, and this is what a curl POST hits.
  if (!viewer.canInitiate) return { ok: false, reason: "cannot-initiate" };

  const recipientUserId = userId === freelancerUserId ? recruiterUserId : freelancerUserId;

  const result = await startConversationTx({
    applicationId: application.id,
    jobId: job.id,
    senderUserId: userId,
    recipientUserId,
    body: input.body,
  });

  if (!result.ok) {
    // Someone got there first, possibly this same user double-clicking. The
    // thread they wanted exists, so route them into it rather than erroring.
    const existing = await findConversationIdForApplication(application.id, userId);
    return { ok: false, reason: "already-exists", ...(existing ? { conversationId: existing } : {}) };
  }

  // Scanned AFTER the write, deliberately: a message is delivered and then
  // flagged for a human, never silently withheld. See message-safety.ts.
  const scan = await scanMessageOnWrite(result.messageId, input.body);
  return { ok: true, conversationId: result.conversationId, flagged: scan.flagged };
}

export type SendMessageResult =
  | { ok: true; flagged: boolean }
  | { ok: false; reason: "no-account" | "banned" | "not-allowed" | "not-a-participant" };

/**
 * Replies in an existing thread.
 *
 * Note what is NOT checked here: the initiate rule. An unverified company that
 * has been written to may answer — that is the whole point of the asymmetry,
 * and requiring verification to reply would leave a freelancer's question
 * hanging with no way for anyone to respond to it.
 */
export async function sendMessageForUser(
  userId: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const resolved = await resolveViewer(userId);
  if (!resolved.ok) return resolved;

  const result = await sendMessageTx({
    conversationId: input.conversationId,
    senderUserId: userId,
    body: input.body,
  });
  if (!result.ok) return result;

  const scan = await scanMessageOnWrite(result.messageId, input.body);
  return { ok: true, flagged: scan.flagged };
}
