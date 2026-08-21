import type { FlagReason } from "@/lib/generated/prisma/enums";
import { isPlausibleId } from "@/lib/services/slug";

import { prisma } from "./client";

/**
 * Prisma access for safety flags.
 *
 * Job flagging happens inside publishJobTx (lib/db/job.ts), where the scan
 * and the status write share one transaction. Message flagging lives here:
 * a message is already saved when it is scanned, so flagging marks the row
 * and opens a moderation entry in one transaction.
 */

export type FlagMessageArgs = {
  messageId: string;
  reason: FlagReason;
  matchedTerm: string;
};

/**
 * Marks a message flagged and opens an automated SafetyFlag. Idempotent per
 * message: re-scanning an already-flagged message adds no second entry, so a
 * retry cannot spam the moderation queue.
 */
export async function flagMessage(args: FlagMessageArgs): Promise<boolean> {
  const { messageId, reason, matchedTerm } = args;
  // An implausible id cannot match a row and must not reach Postgres (a NUL
  // byte there is a 500, not a miss).
  if (!isPlausibleId(messageId)) return false;

  return prisma.$transaction(async (tx) => {
    // The conditional update IS the lock: exactly one concurrent scan can
    // flip isFlagged false -> true, so exactly one opens a queue entry. A
    // read-then-write would let two racing scans both see false and file
    // duplicate moderation rows.
    const claimed = await tx.message.updateMany({
      where: { id: messageId, isFlagged: false },
      data: { isFlagged: true },
    });
    if (claimed.count === 0) return false; // missing, or already flagged

    await tx.safetyFlag.create({
      data: { messageId, reason, matchedTerm, isAutomated: true, status: "OPEN" },
    });
    return true;
  });
}

/**
 * Open moderation entries, OLDEST first — the admin queue (Session 4.3).
 *
 * FIFO is load-bearing given `take: limit`: newest-first would truncate the
 * OLDEST holds, and a held job that falls off the end sits in PENDING_REVIEW
 * with no publishedAt, on no page and no URL, indefinitely. Matches the
 * ordering of the report and verification queues beside it.
 */
export async function listOpenSafetyFlags(limit = 100) {
  return prisma.safetyFlag.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      reason: true,
      matchedTerm: true,
      isAutomated: true,
      createdAt: true,
      job: {
        select: {
          id: true,
          slug: true,
          title: true,
          // The moderator is deciding ON this text, and a held job's public
          // page 404s by design — so the body has to be in the queue itself.
          description: true,
          location: true,
          status: true,
          recruiter: {
            select: { id: true, slug: true, companyName: true, tier: true, isBanned: true },
          },
        },
      },
      message: {
        select: {
          id: true,
          body: true,
          createdAt: true,
          sender: { select: { email: true, role: true } },
        },
      },
    },
  });
}

export async function countOpenSafetyFlags(): Promise<number> {
  return prisma.safetyFlag.count({ where: { status: "OPEN" } });
}
