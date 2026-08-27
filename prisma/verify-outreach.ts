import { prisma } from "../lib/db/client";
import {
  findOutreachConversationId,
  getOutreachParties,
  outreachKeyFor,
  startOutreachTx,
} from "../lib/db/message";

/**
 * Recruiter outreach against the real database.
 *
 * Two things here exist only in Postgres and so only this can check them:
 *
 *  - Conversation_outreachKey_key, added by the 20260827090000 migration. It
 *    is what stops a double-submit splitting one conversation into two, and a
 *    unique index either exists and bites or it does not — a mocked test
 *    cannot tell the difference.
 *  - getOutreachParties, whose entire authorization is a query predicate:
 *    the job is looked up BY OWNER, so a recruiter naming somebody else's job
 *    gets null rather than a stranger's candidate.
 *
 * Everything it writes, it removes.
 *
 *   npx tsx --env-file=.env prisma/verify-outreach.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const job = await prisma.job.findFirstOrThrow({
    where: { status: "ACTIVE" },
    select: { id: true, title: true, recruiter: { select: { id: true, userId: true } } },
  });
  const freelancer = await prisma.freelancerProfile.findFirstOrThrow({
    where: { deactivatedAt: null },
    select: { id: true, userId: true, displayName: true },
  });
  const recruiterUserId = job.recruiter.userId;

  const created: string[] = [];

  try {
    // ── The lookup is the authorization ───────────────────────────────────
    const parties = await getOutreachParties(job.id, freelancer.id, recruiterUserId);
    check("the owner resolves their own job", parties !== null);
    check("and it is open", parties?.jobIsOpen === true);
    check("with the freelancer attached", parties?.freelancerUserId === freelancer.userId);

    const stranger = await prisma.recruiterProfile.findFirst({
      where: { userId: { not: recruiterUserId } },
      select: { userId: true },
    });
    if (stranger) {
      const stolen = await getOutreachParties(job.id, freelancer.id, stranger.userId);
      // The predicate, not an if-statement afterwards.
      check("another company cannot resolve this job at all", stolen === null);
    }

    const closed = await prisma.job.findFirst({
      where: { status: { not: "ACTIVE" }, recruiter: { userId: recruiterUserId } },
      select: { id: true },
    });
    if (closed) {
      const shut = await getOutreachParties(closed.id, freelancer.id, recruiterUserId);
      check("a role that is not open reports itself closed", shut?.jobIsOpen === false);
    }

    // ── The unique index ──────────────────────────────────────────────────
    const first = await startOutreachTx({
      jobId: job.id,
      senderUserId: recruiterUserId,
      recipientUserId: freelancer.userId,
      body: "Verifying outreach. This thread is removed immediately.",
    });
    check("the first outreach opens a thread", first.ok === true);
    if (first.ok) created.push(first.conversationId);

    const second = await startOutreachTx({
      jobId: job.id,
      senderUserId: recruiterUserId,
      recipientUserId: freelancer.userId,
      body: "The same send, twice.",
    });
    // The whole point of the migration.
    check("a second identical send is refused by the index", second.ok === false);
    if (second.ok) created.push(second.conversationId);

    const threads = await prisma.conversation.count({
      where: { outreachKey: outreachKeyFor(job.id, freelancer.userId) },
    });
    check("exactly one thread exists for the pairing", threads === 1, `${threads} found`);

    const found = await findOutreachConversationId(job.id, freelancer.userId, recruiterUserId);
    check("and the recruiter is routed back into it", first.ok && found === first.conversationId);

    const outsider = await prisma.user.findFirst({
      where: { id: { notIn: [recruiterUserId, freelancer.userId] } },
      select: { id: true },
    });
    if (outsider) {
      const peeked = await findOutreachConversationId(job.id, freelancer.userId, outsider.id);
      check("somebody not in the thread cannot find it", peeked === null);
    }

    // Both parties are in it, and the sender has read their own message.
    if (first.ok) {
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId: first.conversationId },
        select: { userId: true, lastReadAt: true },
      });
      check("both people are participants", participants.length === 2);
      check(
        "the recipient has an unread message waiting",
        participants.some((p) => p.userId === freelancer.userId && p.lastReadAt === null),
      );
      check(
        "and the sender does not",
        participants.some((p) => p.userId === recruiterUserId && p.lastReadAt !== null),
      );
      const message = await prisma.message.count({
        where: { conversationId: first.conversationId },
      });
      check("the first message was written in the same transaction", message === 1);
    }

    // ── A profile taken down is unreachable ───────────────────────────────
    await prisma.freelancerProfile.update({
      where: { id: freelancer.id },
      data: { deactivatedAt: new Date() },
    });
    const gone = await getOutreachParties(job.id, freelancer.id, recruiterUserId);
    check("a deactivated freelancer cannot be written to", gone === null);
    await prisma.freelancerProfile.update({
      where: { id: freelancer.id },
      data: { deactivatedAt: null },
    });
  } finally {
    if (created.length > 0) {
      await prisma.message.deleteMany({ where: { conversationId: { in: created } } });
      await prisma.conversationParticipant.deleteMany({
        where: { conversationId: { in: created } },
      });
      await prisma.conversation.deleteMany({ where: { id: { in: created } } });
    }
  }

  const left = await prisma.conversation.count({
    where: { outreachKey: outreachKeyFor(job.id, freelancer.userId) },
  });
  check("everything it created is gone again", left === 0, `${left} left`);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
