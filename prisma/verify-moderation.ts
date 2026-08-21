import "dotenv/config";

import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db/client";
import { listRemovedEmployers } from "../lib/db/moderation";
import {
  banRecruiterAsAdmin,
  clearFlagAsAdmin,
  upholdFlagAsAdmin,
} from "../lib/services/moderation";

/**
 * Moderation invariants that only a real database can prove.
 *
 * The unit tests mock the db layer away, so the transactional rules — publish
 * on clearing the LAST flag, the write-once publishedAt a held job finally
 * receives, and the ban fan-out to REMOVED — have no coverage there. This
 * script exercises them against a live database with throwaway rows and
 * cleans up after itself.
 *
 *   npx tsx prisma/verify-moderation.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: "admin@talent4u.test" },
    select: { id: true },
  });
  if (!admin) throw new Error("Seed the database first: the admin account is missing.");

  const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
  const users: string[] = [];
  const recruiters: string[] = [];

  const makeRecruiter = async (tag: string): Promise<string> => {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `modcheck-${tag}-${userId.slice(0, 8)}@test.local`, role: "RECRUITER" },
    });
    const profile = await prisma.recruiterProfile.create({
      data: {
        userId,
        slug: `modcheck-${tag}-${userId.slice(0, 8)}`,
        companyName: `Modcheck ${tag}`,
        country: "GB",
        tier: "VERIFIED",
      },
      select: { id: true },
    });
    users.push(userId);
    recruiters.push(profile.id);
    return profile.id;
  };

  const makeHeldJob = async (recruiterId: string, tag: string) => {
    const job = await prisma.job.create({
      data: {
        recruiterId,
        slug: `modcheck-job-${tag}-${randomUUID().slice(0, 8)}`,
        title: `Modcheck ${tag}`,
        description: "x".repeat(120),
        categoryId: category.id,
        engagementType: "FIXED",
        isRemote: true,
        status: "PENDING_REVIEW",
        publishedAt: null,
        recruiterTier: "VERIFIED",
      },
      select: { id: true },
    });
    const flag = await prisma.safetyFlag.create({
      data: {
        jobId: job.id,
        reason: "LONG_UNPAID_TEST",
        matchedTerm: "unpaid trial",
        isAutomated: true,
        status: "OPEN",
      },
      select: { id: true },
    });
    return { jobId: job.id, flagId: flag.id };
  };

  try {
    const recruiterId = await makeRecruiter("a");

    // Clearing the last flag publishes a held job and finally sets publishedAt.
    const held = await makeHeldJob(recruiterId, "clear");
    const cleared = await clearFlagAsAdmin(admin.id, held.flagId);
    check(
      "clearing the last flag publishes the held job",
      cleared.ok && "jobPublished" in cleared && cleared.jobPublished,
      JSON.stringify(cleared),
    );
    const published = await prisma.job.findUniqueOrThrow({
      where: { id: held.jobId },
      select: { status: true, publishedAt: true },
    });
    check(
      "the held job receives its write-once publishedAt on approval",
      published.status === "ACTIVE" && published.publishedAt !== null,
      JSON.stringify(published),
    );
    check(
      "re-deciding a handled flag is refused",
      !(await clearFlagAsAdmin(admin.id, held.flagId)).ok,
    );

    // A second open flag keeps the job held.
    const two = await makeHeldJob(recruiterId, "two");
    const sibling = await prisma.safetyFlag.create({
      data: { jobId: two.jobId, reason: "SPAM", isAutomated: false, status: "OPEN" },
      select: { id: true },
    });
    const partial = await clearFlagAsAdmin(admin.id, two.flagId);
    check(
      "clearing one of two flags does not publish",
      partial.ok && "jobPublished" in partial && !partial.jobPublished,
    );
    const stillHeld = await prisma.job.findUniqueOrThrow({
      where: { id: two.jobId },
      select: { status: true },
    });
    check("the job stays held while a flag is open", stillHeld.status === "PENDING_REVIEW");
    const last = await clearFlagAsAdmin(admin.id, sibling.id);
    check(
      "clearing the last remaining flag publishes it",
      last.ok && "jobPublished" in last && last.jobPublished,
    );

    // Upholding removes the post, and it never gains a publishedAt.
    const upheldJob = await makeHeldJob(recruiterId, "uphold");
    check("upholding succeeds", (await upholdFlagAsAdmin(admin.id, upheldJob.flagId)).ok);
    const removed = await prisma.job.findUniqueOrThrow({
      where: { id: upheldJob.jobId },
      select: { status: true, publishedAt: true },
    });
    check(
      "an upheld post is REMOVED and never published",
      removed.status === "REMOVED" && removed.publishedAt === null,
      JSON.stringify(removed),
    );

    // Banning removes EVERY job in the same transaction and upholds open flags.
    const bannedRecruiter = await makeRecruiter("ban");
    const bannedHeld = await makeHeldJob(bannedRecruiter, "ban");
    await prisma.job.create({
      data: {
        recruiterId: bannedRecruiter,
        slug: `modcheck-live-${randomUUID().slice(0, 8)}`,
        title: "Modcheck live",
        description: "x".repeat(120),
        categoryId: category.id,
        engagementType: "FIXED",
        isRemote: true,
        status: "ACTIVE",
        publishedAt: new Date(),
        recruiterTier: "VERIFIED",
      },
    });
    const ban = await banRecruiterAsAdmin(
      admin.id,
      bannedRecruiter,
      "Demanded a security deposit from applicants before interviews.",
    );
    check("banning reports the posts it removed", ban.ok && "jobsRemoved" in ban && ban.jobsRemoved === 2, JSON.stringify(ban));
    const afterBan = await prisma.job.findMany({
      where: { recruiterId: bannedRecruiter },
      select: { status: true },
    });
    check(
      "every job of a banned recruiter is REMOVED",
      afterBan.length > 0 && afterBan.every((j) => j.status === "REMOVED"),
      JSON.stringify(afterBan),
    );
    const bannedFlag = await prisma.safetyFlag.findUniqueOrThrow({
      where: { id: bannedHeld.flagId },
      select: { status: true },
    });
    check("their open flags are upheld by the ban", bannedFlag.status === "UPHELD");
    check("re-banning is refused", !(await banRecruiterAsAdmin(admin.id, bannedRecruiter, "A second ban attempt should not apply.")).ok);
    const listed = await listRemovedEmployers();
    check(
      "the banned company appears on the public removals page",
      listed.some((r) => r.id === bannedRecruiter),
    );

    // A non-admin cannot moderate, even calling the service directly.
    const denied = await clearFlagAsAdmin(users[0], held.flagId);
    check("a recruiter calling the service directly is refused", !denied.ok);
  } finally {
    await prisma.safetyFlag.deleteMany({ where: { job: { recruiterId: { in: recruiters } } } });
    await prisma.job.deleteMany({ where: { recruiterId: { in: recruiters } } });
    await prisma.recruiterProfile.deleteMany({ where: { id: { in: recruiters } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    const removedUsers = await prisma.user.deleteMany({ where: { id: { in: users } } });
    console.log(`cleanup: removed ${removedUsers.count} test recruiters`);
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
