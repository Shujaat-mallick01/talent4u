import "dotenv/config";

import { createHash } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";

// One-off post-seed verification. Run with: npx tsx prisma/verify-seed.ts

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("No database URL set.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const stableId = (namespace: string, key: string): string =>
  `seed${createHash("sha256").update(`talent4u:${namespace}:${key}`).digest("hex").slice(0, 21)}`;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const expectReject = async (name: string, constraintHint: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    check(name, false, "write was ACCEPTED — the database did not reject it");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, message.includes(constraintHint), message.includes(constraintHint) ? `rejected by ${constraintHint}` : `rejected, but not by ${constraintHint}: ${message.slice(0, 200)}`);
  }
};

async function main() {
  // ── Row counts ─────────────────────────────────────────────────────────────
  const counts = {
    category: await prisma.category.count(),
    skill: await prisma.skill.count(),
    user: await prisma.user.count(),
    recruiter: await prisma.recruiterProfile.count(),
    freelancer: await prisma.freelancerProfile.count(),
    job: await prisma.job.count(),
    application: await prisma.application.count(),
    engagement: await prisma.engagement.count(),
    review: await prisma.review.count(),
    subscription: await prisma.subscription.count(),
    safetyFlag: await prisma.safetyFlag.count(),
  };
  check("categories = 3", counts.category === 3, String(counts.category));
  check("skills = 40", counts.skill === 40, String(counts.skill));
  check("users = 27 (20 fl + 6 rec + 1 admin)", counts.user === 27, String(counts.user));
  check("recruiters = 6", counts.recruiter === 6, String(counts.recruiter));
  check("freelancers = 20", counts.freelancer === 20, String(counts.freelancer));
  check("jobs = 15", counts.job === 15, String(counts.job));
  check("applications = 30", counts.application === 30, String(counts.application));
  check("engagements = 4", counts.engagement === 4, String(counts.engagement));
  check("reviews = 4", counts.review === 4, String(counts.review));
  check("subscriptions = 26", counts.subscription === 26, String(counts.subscription));
  check("safety flags = 2 (one per PENDING_REVIEW job)", counts.safetyFlag === 2, String(counts.safetyFlag));

  // ── Job status split and early-access window ──────────────────────────────
  const byStatus = await prisma.job.groupBy({ by: ["status"], _count: true });
  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));
  check(
    "job statuses 10/2/2/1",
    statusMap.ACTIVE === 10 && statusMap.DRAFT === 2 && statusMap.PENDING_REVIEW === 2 && statusMap.CLOSED === 1,
    JSON.stringify(statusMap),
  );

  const boundary = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const inside = await prisma.job.count({ where: { status: "ACTIVE", publishedAt: { gt: boundary } } });
  const outside = await prisma.job.count({ where: { status: "ACTIVE", publishedAt: { lte: boundary } } });
  check("early-access: 3 ACTIVE inside 6h window", inside === 3, String(inside));
  check("early-access: 7 ACTIVE outside 6h window", outside === 7, String(outside));

  // ── Trigger-derived engagement confirmation ────────────────────────────────
  const engagements = await prisma.engagement.findMany({
    select: { freelancerConfirmed: true, recruiterConfirmed: true, isConfirmed: true, confirmedAt: true },
  });
  const derivedOk = engagements.every(
    (e) =>
      e.isConfirmed === (e.freelancerConfirmed && e.recruiterConfirmed) &&
      (e.confirmedAt !== null) === e.isConfirmed,
  );
  const confirmedCount = engagements.filter((e) => e.isConfirmed).length;
  check("trigger derived isConfirmed/confirmedAt on all 4", derivedOk);
  check("exactly 2 engagements mutually confirmed", confirmedCount === 2, String(confirmedCount));

  // ── Generated tsvector + partial index present ─────────────────────────────
  const [{ nullvectors }] = await prisma.$queryRaw<[{ nullvectors: bigint }]>`
    SELECT count(*)::bigint AS nullvectors FROM "FreelancerProfile" WHERE "searchVector" IS NULL`;
  check("searchVector generated for all freelancers", Number(nullvectors) === 0, `${nullvectors} NULL`);

  const [{ hits }] = await prisma.$queryRaw<[{ hits: bigint }]>`
    SELECT count(*)::bigint AS hits FROM "FreelancerProfile"
    WHERE "searchVector" @@ plainto_tsquery('english', 'shopify')`;
  check("full-text search finds shopify freelancers", Number(hits) > 0, `${hits} hits`);

  const partialIdx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'RecruiterProfile' AND indexname = 'RecruiterProfile_banned_bannedAt_idx'`;
  check("partial banned index exists", partialIdx.length === 1);

  // ── Negative tests: the database must reject these ─────────────────────────
  const unconfirmed = stableId("engagement", "eng-nordhafen-marek-hamburg-logistics-portal");
  const confirmed = stableId("engagement", "eng-braithwood-aditya-rag-support-engine");
  const thirdParty = stableId("freelancer", "farhan-qureshi");
  const braithwood = stableId("recruiter", "braithwood-digital");

  await expectReject(
    "review on UNCONFIRMED engagement rejected",
    "Review_engagementId_engagementIsConfirmed_fkey",
    () =>
      prisma.review.create({
        data: {
          id: stableId("review", "negative-test-unconfirmed"),
          engagementId: unconfirmed,
          engagementIsConfirmed: true,
          authorFreelancerId: stableId("freelancer", "marek-wisniewski"),
          subjectRecruiterId: stableId("recruiter", "nordhafen-systeme"),
          rating: 5,
          body: "This must never be inserted.",
        },
      }),
  );

  await expectReject(
    "third-party author on confirmed engagement rejected",
    "review_author_freelancer_is_engagement_party",
    () =>
      prisma.review.create({
        data: {
          id: stableId("review", "negative-test-third-party"),
          engagementId: confirmed,
          engagementIsConfirmed: true,
          authorFreelancerId: thirdParty, // not a party to this engagement
          subjectRecruiterId: braithwood,
          rating: 1,
          body: "This must never be inserted.",
        },
      }),
  );

  await expectReject(
    "role mutation with existing profile rejected",
    "FreelancerProfile_userId_userRole_fkey",
    () =>
      prisma.$executeRaw`
        UPDATE "User" SET "role" = 'RECRUITER'
        WHERE "id" = (SELECT "userId" FROM "FreelancerProfile" WHERE "slug" = 'aditya-ranganathan')`,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
