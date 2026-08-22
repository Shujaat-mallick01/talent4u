import { Prisma } from "@/lib/generated/prisma/client";
import { isPlausibleId } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * Prisma access for conversations and messages.
 *
 * Two things this file is careful about:
 *
 * 1. Every write that adds a message also advances lastMessageAt on the
 *    conversation AND on both participant rows, in the same transaction. That
 *    mirror is what makes "my conversations, newest first" a single index scan
 *    with no join and no sort (ConversationParticipant_inbox_idx). If it ever
 *    drifts, the inbox silently reorders, so it is written in one place.
 *
 * 2. Membership is the authorization boundary and it is expressed as a query
 *    predicate, not an if-statement. Every read and write below is scoped by
 *    "a participant row exists for this user", so a caller naming someone
 *    else's conversation gets nothing rather than a leak.
 */

/**
 * The counterparty, as every messaging surface needs them. avatarUrl/logoUrl
 * ride along so an inbox row and a thread header can lead with a face or a
 * mark instead of a bare string — two nullable columns on rows already being
 * read, no extra query.
 */
const PARTICIPANT_USER = {
  select: {
    id: true,
    email: true,
    role: true,
    freelancer: {
      select: { slug: true, displayName: true, verification: true, avatarUrl: true },
    },
    recruiter: {
      select: { slug: true, companyName: true, tier: true, isBanned: true, logoUrl: true },
    },
  },
} satisfies Prisma.ConversationParticipantSelect["user"];

/** One inbox row: the counterparty, the job, and whether anything is unread. */
export async function listConversationsForUser(userId: string, limit = 50) {
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId, isArchived: false },
    // Matches ConversationParticipant_inbox_idx exactly, including the
    // conversationId tiebreaker — lastMessageAt alone is not a total order.
    orderBy: [{ lastMessageAt: "desc" }, { conversationId: "desc" }],
    take: limit,
    select: {
      conversationId: true,
      lastReadAt: true,
      lastMessageAt: true,
      conversation: {
        select: {
          id: true,
          job: { select: { slug: true, title: true, status: true } },
          participants: {
            where: { userId: { not: userId } },
            select: { user: PARTICIPANT_USER },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, createdAt: true, senderId: true, isFlagged: true },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const latest = row.conversation.messages[0] ?? null;
    return {
      id: row.conversationId,
      job: row.conversation.job,
      other: row.conversation.participants[0]?.user ?? null,
      latest,
      lastMessageAt: row.lastMessageAt,
      // Unread means: someone else's message landed after I last looked.
      // Never true for a message the viewer sent themselves.
      isUnread:
        latest !== null &&
        latest.senderId !== userId &&
        (row.lastReadAt === null || latest.createdAt > row.lastReadAt),
    };
  });
}

/** Unread thread count, for the nav badge. */
export async function countUnreadConversations(userId: string): Promise<number> {
  const rows = await listConversationsForUser(userId, 100);
  return rows.filter((r) => r.isUnread).length;
}

export type ConversationThread = NonNullable<Awaited<ReturnType<typeof getConversationForUser>>>;

/**
 * A full thread, but only if this user is in it. Membership is part of the
 * where clause, so a non-participant gets null — indistinguishable from a
 * conversation that does not exist, which is the point.
 */
export async function getConversationForUser(conversationId: string, userId: string) {
  if (!isPlausibleId(conversationId)) return null;

  return prisma.conversation.findFirst({
    where: { id: conversationId, participants: { some: { userId } } },
    select: {
      id: true,
      createdAt: true,
      job: { select: { id: true, slug: true, title: true, status: true } },
      application: { select: { id: true, status: true, createdAt: true } },
      participants: { select: { userId: true, lastReadAt: true, user: PARTICIPANT_USER } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          body: true,
          senderId: true,
          isFlagged: true,
          createdAt: true,
        },
      },
    },
  });
}

export type StartResult =
  | { ok: true; conversationId: string; messageId: string; created: boolean }
  | { ok: false; reason: "already-exists" };

/**
 * Opens the thread for an application and posts its first message.
 *
 * Everything is one transaction: the conversation, both participant rows, the
 * message, and the lastMessageAt mirrors. A half-created thread with no
 * participants would be invisible to both parties and unreachable forever.
 *
 * A duplicate is refused by Conversation_applicationId_key rather than by a
 * read-then-write, so two simultaneous clicks cannot both open a thread.
 */
export async function startConversationTx(args: {
  applicationId: string;
  jobId: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
}): Promise<StartResult> {
  const { applicationId, jobId, senderUserId, recipientUserId, body } = args;

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const conversation = await tx.conversation.create({
        data: {
          applicationId,
          jobId,
          lastMessageAt: now,
          participants: {
            create: [
              // The sender has read their own message by definition.
              { userId: senderUserId, lastMessageAt: now, lastReadAt: now },
              { userId: recipientUserId, lastMessageAt: now },
            ],
          },
        },
        select: { id: true },
      });

      const message = await tx.message.create({
        data: { conversationId: conversation.id, senderId: senderUserId, body },
        select: { id: true },
      });

      return {
        ok: true as const,
        conversationId: conversation.id,
        messageId: message.id,
        created: true,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "already-exists" };
    }
    throw error;
  }
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "not-a-participant" };

/**
 * Appends a message. The participant check is the updateMany predicate rather
 * than a prior read: if the caller is not in the thread, zero rows update and
 * nothing is written.
 */
export async function sendMessageTx(args: {
  conversationId: string;
  senderUserId: string;
  body: string;
}): Promise<SendResult> {
  const { conversationId, senderUserId, body } = args;
  if (!isPlausibleId(conversationId)) return { ok: false, reason: "not-a-participant" };

  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // Membership proven by the write itself.
    const member = await tx.conversationParticipant.updateMany({
      where: { conversationId, userId: senderUserId },
      data: { lastMessageAt: now, lastReadAt: now },
    });
    if (member.count === 0) return { ok: false, reason: "not-a-participant" } as const;

    const message = await tx.message.create({
      data: { conversationId, senderId: senderUserId, body },
      select: { id: true },
    });

    // Everyone else's row advances too, but their lastReadAt is untouched —
    // that difference is what makes the thread show as unread for them.
    await tx.conversationParticipant.updateMany({
      where: { conversationId, userId: { not: senderUserId } },
      data: { lastMessageAt: now },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    });

    return { ok: true, messageId: message.id } as const;
  });
}

/** Marks a thread read up to now, for one participant. */
export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  if (!isPlausibleId(conversationId)) return;
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });
}

/** The conversation attached to an application, if the viewer is in it. */
export async function findConversationIdForApplication(
  applicationId: string,
  userId: string,
): Promise<string | null> {
  if (!isPlausibleId(applicationId)) return null;
  const row = await prisma.conversation.findFirst({
    where: { applicationId, participants: { some: { userId } } },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Which of these applications already have a thread this viewer is in — so a
 * list of applicants can show "Message" or "Open thread" without one query
 * per row.
 */
export async function mapApplicationConversations(
  applicationIds: string[],
  userId: string,
): Promise<Map<string, string>> {
  if (applicationIds.length === 0) return new Map();
  const rows = await prisma.conversation.findMany({
    where: {
      applicationId: { in: applicationIds },
      participants: { some: { userId } },
    },
    select: { id: true, applicationId: true },
  });
  return new Map(
    rows.flatMap((r) => (r.applicationId ? [[r.applicationId, r.id] as const] : [])),
  );
}
