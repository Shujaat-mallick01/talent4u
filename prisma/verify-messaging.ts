import "dotenv/config";

import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db/client";
import { listConversationsForUser } from "../lib/db/message";
import {
  getThreadForUser,
  sendMessageForUser,
  startConversationForUser,
} from "../lib/services/message";

/**
 * Messaging against a live database.
 *
 * What only a real database can show: that the one-thread-per-application
 * uniqueness actually holds under a duplicate, that the lastMessageAt mirrors
 * stay in step so the inbox orders correctly, that unread is computed from
 * lastReadAt rather than guessed, and that the safety scanner flags a message
 * WITHOUT withholding it.
 *
 *   npx tsx prisma/verify-messaging.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const recruiterIds: string[] = [];
  const freelancerIds: string[] = [];

  const makeRecruiter = async (name: string, tier: "UNVERIFIED" | "VERIFIED") => {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `msg-${name}-${tag}@test.local`, role: "RECRUITER" },
    });
    const p = await prisma.recruiterProfile.create({
      data: { userId, slug: `msg-${name}-${tag}`, companyName: `Msg ${name}`, country: "GB", tier },
      select: { id: true },
    });
    userIds.push(userId);
    recruiterIds.push(p.id);
    return { userId, profileId: p.id };
  };

  const makeFreelancer = async (name: string) => {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `msg-${name}-${tag}@test.local`, role: "FREELANCER" },
    });
    const p = await prisma.freelancerProfile.create({
      data: {
        userId,
        slug: `msg-${name}-${tag}`,
        displayName: `Msg ${name}`,
        headline: "Test freelancer for the messaging invariants",
        bio: "x".repeat(80),
        country: "PK",
        timezone: "Asia/Karachi",
      },
      select: { id: true },
    });
    userIds.push(userId);
    freelancerIds.push(p.id);
    return { userId, profileId: p.id };
  };

  const makeApplication = async (recruiterId: string, freelancerId: string, n: number) => {
    const job = await prisma.job.create({
      data: {
        recruiterId,
        slug: `msg-job-${n}-${tag}`,
        title: `Msg job ${n}`,
        description: "x".repeat(120),
        categoryId: category.id,
        engagementType: "FIXED",
        isRemote: true,
        status: "ACTIVE",
        publishedAt: new Date(),
        recruiterTier: "VERIFIED",
      },
      select: { id: true },
    });
    const app = await prisma.application.create({
      data: { jobId: job.id, freelancerId, coverLetter: "x".repeat(100) },
      select: { id: true },
    });
    return { jobId: job.id, applicationId: app.id };
  };

  try {
    const verified = await makeRecruiter("verified", "VERIFIED");
    const unverified = await makeRecruiter("unverified", "UNVERIFIED");
    const dev = await makeFreelancer("dev");
    const stranger = await makeFreelancer("stranger");

    const a1 = await makeApplication(verified.profileId, dev.profileId, 1);
    const a2 = await makeApplication(unverified.profileId, dev.profileId, 2);

    // ── Who may open a thread ─────────────────────────────────────────────
    const unverifiedTry = await startConversationForUser(unverified.userId, {
      applicationId: a2.applicationId,
      body: "Hello, are you available?",
    });
    check(
      "an UNVERIFIED company cannot write first",
      !unverifiedTry.ok && unverifiedTry.reason === "cannot-initiate",
      JSON.stringify(unverifiedTry),
    );

    const strangerTry = await startConversationForUser(stranger.userId, {
      applicationId: a1.applicationId,
      body: "Let me in",
    });
    check("a stranger cannot open someone else's thread", !strangerTry.ok);

    const opened = await startConversationForUser(verified.userId, {
      applicationId: a1.applicationId,
      body: "Are you free to start on the 3rd?",
    });
    check("a VERIFIED company can write first", opened.ok, JSON.stringify(opened));
    if (!opened.ok) throw new Error("cannot continue without a thread");
    const convId = opened.conversationId;

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: convId },
      select: { userId: true, lastReadAt: true },
    });
    check(
      "both parties are participants, and only the sender has read it",
      participants.length === 2 &&
        participants.find((p) => p.userId === verified.userId)?.lastReadAt !== null &&
        participants.find((p) => p.userId === dev.userId)?.lastReadAt === null,
      JSON.stringify(participants.map((p) => ({ read: p.lastReadAt !== null }))),
    );

    // ── One thread per application ────────────────────────────────────────
    const duplicate = await startConversationForUser(verified.userId, {
      applicationId: a1.applicationId,
      body: "Second click",
    });
    check(
      "a second attempt returns the SAME thread rather than opening another",
      !duplicate.ok && duplicate.reason === "already-exists" && duplicate.conversationId === convId,
      JSON.stringify(duplicate),
    );
    const threadCount = await prisma.conversation.count({
      where: { applicationId: a1.applicationId },
    });
    check("exactly one conversation exists for that application", threadCount === 1, String(threadCount));

    // ── Unread, and reading ───────────────────────────────────────────────
    const devInbox = await listConversationsForUser(dev.userId);
    check(
      "the recipient sees it as unread",
      devInbox.length === 1 && devInbox[0].isUnread,
      JSON.stringify(devInbox.map((c) => c.isUnread)),
    );
    const senderInbox = await listConversationsForUser(verified.userId);
    check(
      "the sender does not see their own message as unread",
      senderInbox.length === 1 && !senderInbox[0].isUnread,
    );

    const read = await getThreadForUser(dev.userId, convId);
    check("the recipient can open it", read.ok);
    const afterRead = await listConversationsForUser(dev.userId);
    check("opening it clears the unread mark", afterRead.length === 1 && !afterRead[0].isUnread);

    check(
      "a stranger cannot open the thread",
      !(await getThreadForUser(stranger.userId, convId)).ok,
    );

    // ── Replying ──────────────────────────────────────────────────────────
    const reply = await sendMessageForUser(dev.userId, {
      conversationId: convId,
      body: "Yes — the 3rd works. My email is dev@example.com if that is easier.",
    });
    check("the other party can reply", reply.ok && !reply.flagged, JSON.stringify(reply));
    check(
      "sharing contact details is NOT flagged — anti-circumvention is not enforced",
      reply.ok && !reply.flagged,
    );

    const strangerReply = await sendMessageForUser(stranger.userId, {
      conversationId: convId,
      body: "Butting in",
    });
    check("a non-participant cannot reply", !strangerReply.ok);

    const backUnread = await listConversationsForUser(verified.userId);
    check(
      "the reply marks the thread unread for the original sender",
      backUnread.length === 1 && backUnread[0].isUnread,
    );

    // ── The UNVERIFIED company CAN reply ──────────────────────────────────
    const openedToUnverified = await startConversationForUser(dev.userId, {
      applicationId: a2.applicationId,
      body: "Hello — is this role still open?",
    });
    check("a freelancer can write first to an unverified company", openedToUnverified.ok);
    if (openedToUnverified.ok) {
      const unverifiedReply = await sendMessageForUser(unverified.userId, {
        conversationId: openedToUnverified.conversationId,
        body: "It is — happy to talk.",
      });
      check(
        "the unverified company CAN reply, which is the point of the asymmetry",
        unverifiedReply.ok,
        JSON.stringify(unverifiedReply),
      );
    }

    // ── The safety scanner ────────────────────────────────────────────────
    const scam = await sendMessageForUser(verified.userId, {
      conversationId: convId,
      body: "Before we start, please pay the $50 registration fee to secure your slot.",
    });
    check("a scam-pattern message is flagged", scam.ok && scam.flagged, JSON.stringify(scam));

    const flagged = await prisma.message.findFirst({
      where: { conversationId: convId, isFlagged: true },
      select: { id: true, body: true },
    });
    check("and it was still DELIVERED, not withheld", flagged !== null);
    const queued = await prisma.safetyFlag.count({
      where: { messageId: flagged?.id, status: "OPEN" },
    });
    check("and it opened exactly one moderation entry", queued === 1, String(queued));

    // ── Ordering ──────────────────────────────────────────────────────────
    const ordered = await listConversationsForUser(dev.userId);
    check(
      "the inbox is newest-first across both threads",
      ordered.length === 2 &&
        ordered[0].lastMessageAt.getTime() >= ordered[1].lastMessageAt.getTime(),
      ordered.map((c) => c.lastMessageAt.toISOString()).join(" >= "),
    );

    // ── A removed employer ────────────────────────────────────────────────
    await prisma.recruiterProfile.update({
      where: { id: verified.profileId },
      data: { isBanned: true, bannedAt: new Date(), bannedReason: "Msgcheck fixture." },
    });
    check(
      "a removed employer cannot reply in a thread they were already in",
      !(await sendMessageForUser(verified.userId, { conversationId: convId, body: "Still here" })).ok,
    );
  } finally {
    await prisma.message.deleteMany({
      where: { conversation: { job: { recruiterId: { in: recruiterIds } } } },
    });
    await prisma.safetyFlag.deleteMany({ where: { job: { recruiterId: { in: recruiterIds } } } });
    await prisma.conversationParticipant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.conversation.deleteMany({ where: { job: { recruiterId: { in: recruiterIds } } } });
    await prisma.application.deleteMany({ where: { job: { recruiterId: { in: recruiterIds } } } });
    await prisma.job.deleteMany({ where: { recruiterId: { in: recruiterIds } } });
    await prisma.recruiterProfile.deleteMany({ where: { id: { in: recruiterIds } } });
    await prisma.freelancerProfile.deleteMany({ where: { id: { in: freelancerIds } } });
    const removed = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    console.log(`cleanup: removed ${removed.count} test accounts`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
