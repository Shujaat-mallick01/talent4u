import "dotenv/config";

import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db/client";
import {
  amendEngagementTermsForUser,
  confirmEngagementForUser,
  declineEngagementForUser,
  proposeEngagementForUser,
  writeReviewForUser,
} from "../lib/services/engagement";

/**
 * The mutual-confirmation invariant, against a live database.
 *
 * The unit tests mock the db layer away, so the part of this rule that lives
 * in Postgres — the composite FK into Engagement(id, isConfirmed), the trigger
 * deriving confirmedAt, and the four party-binding FKs — has no coverage
 * there. This script drives the real service against real rows and then tries,
 * from raw SQL, the attacks the service refuses. Cleans up after itself.
 *
 *   npx tsx prisma/verify-engagement.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Runs a write that MUST be rejected by the database. */
const mustReject = async (name: string, run: () => Promise<unknown>) => {
  try {
    await run();
    check(name, false, "the database ACCEPTED it");
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n").pop() ?? "" : "";
    check(name, true, message.trim().slice(0, 80));
  }
};

const TERMS = { statedRateUsd: 4000, durationWeeks: 6 };

const REVIEW_BODY =
  "Clear scope, answered questions quickly, and the figures matched what we agreed up front.";

async function main() {
  const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const recruiterIds: string[] = [];
  const freelancerIds: string[] = [];

  const makeRecruiter = async (name: string, tier: "VERIFIED" | "UNVERIFIED" = "VERIFIED") => {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `eng-${name}-${tag}@test.local`, role: "RECRUITER" },
    });
    const profile = await prisma.recruiterProfile.create({
      data: {
        userId,
        slug: `eng-${name}-${tag}`,
        companyName: `Engcheck ${name}`,
        country: "GB",
        tier,
      },
      select: { id: true },
    });
    userIds.push(userId);
    recruiterIds.push(profile.id);
    return { userId, profileId: profile.id };
  };

  const makeFreelancer = async (name: string) => {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `eng-${name}-${tag}@test.local`, role: "FREELANCER" },
    });
    const profile = await prisma.freelancerProfile.create({
      data: {
        userId,
        slug: `eng-${name}-${tag}`,
        displayName: `Engcheck ${name}`,
        headline: "Test freelancer for the engagement invariants",
        bio: "x".repeat(80),
        country: "PK",
        timezone: "Asia/Karachi",
      },
      select: { id: true },
    });
    userIds.push(userId);
    freelancerIds.push(profile.id);
    return { userId, profileId: profile.id };
  };

  const makeJobWithApplication = async (recruiterId: string, freelancerId: string, n: number) => {
    const job = await prisma.job.create({
      data: {
        recruiterId,
        slug: `eng-job-${n}-${tag}`,
        title: `Engcheck job ${n}`,
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
    const application = await prisma.application.create({
      data: { jobId: job.id, freelancerId, coverLetter: "x".repeat(100) },
      select: { id: true },
    });
    return { jobId: job.id, applicationId: application.id };
  };

  try {
    const recruiter = await makeRecruiter("co");
    const freelancer = await makeFreelancer("dev");
    const stranger = await makeFreelancer("stranger");
    const { applicationId } = await makeJobWithApplication(
      recruiter.profileId,
      freelancer.profileId,
      1,
    );

    // ── Proposal ──────────────────────────────────────────────────────────
    const proposed = await proposeEngagementForUser(recruiter.userId, {
      applicationId,
      statedRateUsd: 4000,
      durationWeeks: 6,
    });
    check("a recruiter can record an engagement from their own application", proposed.ok, JSON.stringify(proposed));
    if (!proposed.ok) throw new Error("cannot continue without an engagement");
    const engagementId = proposed.engagementId;

    const pending = await prisma.engagement.findUniqueOrThrow({
      where: { id: engagementId },
      select: { recruiterConfirmed: true, freelancerConfirmed: true, isConfirmed: true, confirmedAt: true },
    });
    check(
      "the proposer is confirmed and the other side is not",
      pending.recruiterConfirmed && !pending.freelancerConfirmed && !pending.isConfirmed,
      JSON.stringify(pending),
    );
    check("an unconfirmed engagement has no confirmedAt", pending.confirmedAt === null);

    check(
      "a stranger cannot record an engagement from someone else's application",
      !(await proposeEngagementForUser(stranger.userId, {
        applicationId,
        statedRateUsd: 999,
        durationWeeks: 1,
      })).ok,
    );

    // ── The lock, before confirmation ─────────────────────────────────────
    const early = await writeReviewForUser(recruiter.userId, {
      engagementId,
      rating: 5,
      body: REVIEW_BODY,
    });
    check(
      "the service refuses a review before both sides confirm",
      !early.ok && early.reason === "not-confirmed",
      JSON.stringify(early),
    );

    // The same attempt, going around the service entirely.
    await mustReject(
      "the DATABASE refuses a review on an unconfirmed engagement",
      () =>
        prisma.review.create({
          data: {
            engagementId,
            rating: 5,
            body: REVIEW_BODY,
            authorRecruiterId: recruiter.profileId,
            subjectFreelancerId: freelancer.profileId,
          },
        }),
    );

    check(
      "the proposer cannot confirm their own claim a second time",
      !(await confirmEngagementForUser(recruiter.userId, engagementId, TERMS)).ok,
    );
    check(
      "a stranger cannot confirm someone else's engagement",
      !(await confirmEngagementForUser(stranger.userId, engagementId, TERMS)).ok,
    );

    // ── Confirmation ──────────────────────────────────────────────────────
    const confirmed = await confirmEngagementForUser(freelancer.userId, engagementId, TERMS);
    check("the counterparty can confirm", confirmed.ok, JSON.stringify(confirmed));

    const afterConfirm = await prisma.engagement.findUniqueOrThrow({
      where: { id: engagementId },
      select: { isConfirmed: true, confirmedAt: true },
    });
    check(
      "the trigger derives isConfirmed and stamps confirmedAt",
      afterConfirm.isConfirmed && afterConfirm.confirmedAt !== null,
      JSON.stringify(afterConfirm),
    );

    // ── Reviews, now unlocked ─────────────────────────────────────────────
    const byRecruiter = await writeReviewForUser(recruiter.userId, {
      engagementId,
      rating: 5,
      body: REVIEW_BODY,
    });
    check("the recruiter can now review the freelancer", byRecruiter.ok, JSON.stringify(byRecruiter));

    const byFreelancer = await writeReviewForUser(freelancer.userId, {
      engagementId,
      rating: 4,
      body: REVIEW_BODY,
    });
    check("the freelancer can now review the recruiter", byFreelancer.ok);

    const stored = await prisma.review.findMany({
      where: { engagementId },
      select: {
        authorRecruiterId: true,
        authorFreelancerId: true,
        subjectFreelancerId: true,
        subjectRecruiterId: true,
      },
    });
    check(
      "each review points from one side to the other, never at its own side",
      stored.length === 2 &&
        stored.every(
          (r) =>
            (r.authorRecruiterId !== null && r.subjectFreelancerId !== null && r.authorFreelancerId === null) ||
            (r.authorFreelancerId !== null && r.subjectRecruiterId !== null && r.authorRecruiterId === null),
        ),
      JSON.stringify(stored),
    );

    check(
      "a second review from the same party is refused",
      !(await writeReviewForUser(recruiter.userId, {
        engagementId,
        rating: 1,
        body: REVIEW_BODY,
      })).ok,
    );

    await mustReject(
      "the DATABASE refuses a review authored by a third party",
      () =>
        prisma.review.create({
          data: {
            engagementId,
            rating: 1,
            body: REVIEW_BODY,
            authorFreelancerId: stranger.profileId,
            subjectRecruiterId: recruiter.profileId,
          },
        }),
    );

    await mustReject(
      "the DATABASE refuses un-confirming an engagement that has reviews",
      () =>
        prisma.engagement.update({
          where: { id: engagementId },
          data: { freelancerConfirmed: false },
        }),
    );

    // ── Decline ───────────────────────────────────────────────────────────
    const second = await makeJobWithApplication(recruiter.profileId, freelancer.profileId, 2);
    const toDecline = await proposeEngagementForUser(recruiter.userId, {
      applicationId: second.applicationId,
      statedRateUsd: 100,
      durationWeeks: 1,
    });
    if (!toDecline.ok) throw new Error("second proposal failed");

    check(
      "the proposer cannot decline their own claim",
      !(await declineEngagementForUser(recruiter.userId, toDecline.engagementId)).ok,
    );
    check(
      "the counterparty can decline",
      (await declineEngagementForUser(freelancer.userId, toDecline.engagementId)).ok,
    );
    check(
      "a declined engagement cannot then be confirmed",
      !(await confirmEngagementForUser(freelancer.userId, toDecline.engagementId, { statedRateUsd: 100, durationWeeks: 1 })).ok,
    );
    check(
      "a declined engagement unlocks no reviews",
      !(await writeReviewForUser(freelancer.userId, {
        engagementId: toDecline.engagementId,
        rating: 5,
        body: REVIEW_BODY,
      })).ok,
    );
    check(
      "the same claim cannot be re-filed at the same person",
      !(await proposeEngagementForUser(recruiter.userId, {
        applicationId: second.applicationId,
        statedRateUsd: 100,
        durationWeeks: 1,
      })).ok,
    );

    await mustReject(
      "the DATABASE refuses a row that is both declined and confirmed",
      () =>
        prisma.$executeRaw`UPDATE "Engagement" SET "freelancerConfirmed" = true WHERE "id" = ${toDecline.engagementId}`,
    );

    // ── A confirmation is bound to the figures that were shown ────────────
    // The proposer may amend right up until the counterparty answers. If the
    // confirmation carried only an id, an amend landing between page render
    // and click would be absorbed silently, and the confirming party would be
    // on record agreeing to a rate and duration never displayed to them.
    const swapJob = await makeJobWithApplication(recruiter.profileId, freelancer.profileId, 4);
    const swap = await proposeEngagementForUser(recruiter.userId, {
      applicationId: swapJob.applicationId,
      statedRateUsd: 8000,
      durationWeeks: 12,
    });
    if (!swap.ok) throw new Error("swap proposal failed");

    // What the freelancer's page rendered.
    const shown = { statedRateUsd: 8000, durationWeeks: 12 };
    // The proposer quietly rewrites the claim.
    const amended = await amendEngagementTermsForUser(recruiter.userId, swap.engagementId, {
      statedRateUsd: 200,
      durationWeeks: 1,
    });
    check("the proposer can amend while the other side is undecided", amended.ok);

    const stale = await confirmEngagementForUser(freelancer.userId, swap.engagementId, shown);
    check(
      "a confirmation against the shown figures is refused once they changed",
      !stale.ok && stale.reason === "terms-changed",
      JSON.stringify(stale),
    );
    const notConfirmed = await prisma.engagement.findUniqueOrThrow({
      where: { id: swap.engagementId },
      select: { isConfirmed: true, freelancerConfirmed: true },
    });
    check(
      "and the engagement is left untouched",
      !notConfirmed.isConfirmed && !notConfirmed.freelancerConfirmed,
      JSON.stringify(notConfirmed),
    );
    const reRead = await confirmEngagementForUser(freelancer.userId, swap.engagementId, {
      statedRateUsd: 200,
      durationWeeks: 1,
    });
    check("confirming the CURRENT figures works", reRead.ok, JSON.stringify(reRead));

    // ── Terms are what is being confirmed ─────────────────────────────────
    // The columns are nullable, so a row can exist with no figures. Confirming
    // one would still unlock reviews and count toward TRUSTED, which is not
    // what CLAUDE.md's "with stated rate and duration" means.
    const third = await makeJobWithApplication(recruiter.profileId, freelancer.profileId, 3);
    const termless = await prisma.engagement.create({
      data: {
        jobId: third.jobId,
        freelancerId: freelancer.profileId,
        recruiterId: recruiter.profileId,
        recruiterConfirmed: true,
      },
      select: { id: true },
    });
    const refused = await confirmEngagementForUser(freelancer.userId, termless.id, { statedRateUsd: 1, durationWeeks: 1 });
    check(
      "an engagement with no stated rate and duration cannot be confirmed",
      !refused.ok && refused.reason === "terms-missing",
      JSON.stringify(refused),
    );
    const stillOpen = await prisma.engagement.findUniqueOrThrow({
      where: { id: termless.id },
      select: { isConfirmed: true },
    });
    check("and it stays unconfirmed", !stillOpen.isConfirmed);

    // ── TRUSTED promotion ─────────────────────────────────────────────────
    const promoter = await makeRecruiter("trust");
    const devs = await Promise.all([makeFreelancer("t1"), makeFreelancer("t2"), makeFreelancer("t3")]);
    for (const [i, dev] of devs.entries()) {
      const app = await makeJobWithApplication(promoter.profileId, dev.profileId, 10 + i);
      const p = await proposeEngagementForUser(promoter.userId, {
        applicationId: app.applicationId,
        statedRateUsd: 1000,
        durationWeeks: 2,
      });
      if (!p.ok) throw new Error("promotion proposal failed");
      const c = await confirmEngagementForUser(dev.userId, p.engagementId, { statedRateUsd: 1000, durationWeeks: 2 });
      if (i < 2) {
        check(
          `no promotion at ${i + 1} confirmed ${i === 0 ? "engagement" : "engagements"}`,
          c.ok && !c.promotedToTrusted,
        );
      } else {
        check("promoted to TRUSTED on the third distinct confirmation", c.ok && c.promotedToTrusted);
      }
    }
    const promoted = await prisma.recruiterProfile.findUniqueOrThrow({
      where: { id: promoter.profileId },
      select: { tier: true },
    });
    check("the tier is persisted as TRUSTED", promoted.tier === "TRUSTED", promoted.tier);

    // A banned employer must never collect the badge.
    const banned = await makeRecruiter("banned");
    await prisma.recruiterProfile.update({
      where: { id: banned.profileId },
      data: { isBanned: true, bannedAt: new Date(), bannedReason: "Engcheck fixture." },
    });
    const bannedApp = await makeJobWithApplication(banned.profileId, freelancer.profileId, 20);
    check(
      "a freelancer cannot record work for a removed employer",
      !(await proposeEngagementForUser(freelancer.userId, {
        applicationId: bannedApp.applicationId,
        statedRateUsd: 100,
        durationWeeks: 1,
      })).ok,
    );
    check(
      "a removed employer cannot record work either",
      !(await proposeEngagementForUser(banned.userId, {
        applicationId: bannedApp.applicationId,
        statedRateUsd: 100,
        durationWeeks: 1,
      })).ok,
    );
  } finally {
    const all = [...recruiterIds];
    await prisma.review.deleteMany({ where: { engagement: { recruiterId: { in: all } } } });
    await prisma.engagement.deleteMany({ where: { recruiterId: { in: all } } });
    await prisma.application.deleteMany({ where: { job: { recruiterId: { in: all } } } });
    await prisma.job.deleteMany({ where: { recruiterId: { in: all } } });
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
