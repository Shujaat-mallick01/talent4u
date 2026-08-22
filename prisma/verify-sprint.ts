import "dotenv/config";

import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db/client";
import { getPublicFreelancerBySlug } from "../lib/db/freelancer";
import { setProfileVisibilityForUser } from "../lib/services/settings";
import { updateFreelancerProfileForUser } from "../lib/services/profile-edit";
import {
  approveFreelancerWorkLinks,
  submitFreelancerVerification,
} from "../lib/services/freelancer-verification";
import { createReportForUser } from "../lib/services/report";

/**
 * The sprint's cross-stream behaviours, live.
 *
 * Each of these spans work by more than one stream (deactivation: settings
 * writes the flag, public reads filter it, the sitemap excludes it; the
 * verification withdrawal: profile editing crosses into the verification
 * queue), so no single stream's unit tests could prove them. This does.
 *
 *   npx tsx prisma/verify-sprint.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@talent4u.test" },
    select: { id: true },
  });

  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  const makeFreelancer = async () => {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `sprint-${tag}@test.local`, role: "FREELANCER" },
    });
    const profile = await prisma.freelancerProfile.create({
      data: {
        userId,
        slug: `sprint-dev-${tag}`,
        displayName: `Sprint Dev ${tag}`,
        headline: "Full-stack engineer for cross-stream verification",
        bio: "x".repeat(200),
        country: "PK",
        timezone: "Asia/Karachi",
        githubUrl: "https://github.com/sprint-dev",
        skills: {
          create: [
            {
              yearsExp: 3,
              skill: { connect: { id: (await prisma.skill.findFirstOrThrow({ select: { id: true } })).id } },
            },
          ],
        },
      },
      select: { id: true, slug: true },
    });
    userIds.push(userId);
    return { userId, ...profile };
  };

  const dev = await makeFreelancer();

  try {
    // ── Deactivation, end to end ──────────────────────────────────────────
    check(
      "a live profile is publicly readable",
      (await getPublicFreelancerBySlug(dev.slug)) !== null,
    );

    const off = await setProfileVisibilityForUser(dev.userId, { action: "deactivate" });
    check("the owner can deactivate", off.ok, JSON.stringify(off));
    check(
      "a deactivated profile 404s publicly, exactly like one that never existed",
      (await getPublicFreelancerBySlug(dev.slug)) === null,
    );
    check(
      "deactivating twice is a no-op, not an error",
      (await setProfileVisibilityForUser(dev.userId, { action: "deactivate" })).ok,
    );
    check(
      "the owner can still edit while deactivated",
      (
        await updateFreelancerProfileForUser(dev.userId, {
          displayName: "Sprint Dev Edited",
          headline: "Full-stack engineer for cross-stream verification",
          bio: "y".repeat(200),
          country: "PK",
          timezone: "Asia/Karachi",
          hourlyRateUsd: 50,
          isOpenToWork: true,
          githubUrl: "https://github.com/sprint-dev",
          portfolioUrl: null,
          linkedinUrl: null,
          skills: [
            {
              slug: (await prisma.skill.findFirstOrThrow({ select: { slug: true } })).slug,
              yearsExp: 3,
            },
          ],
        })
      ).ok,
    );

    const on = await setProfileVisibilityForUser(dev.userId, { action: "reactivate" });
    check("and reactivate", on.ok);
    check(
      "the page comes back",
      (await getPublicFreelancerBySlug(dev.slug)) !== null,
    );

    // ── A banned recruiter cannot reactivate into visibility ──────────────
    const bannedRec = await prisma.recruiterProfile.findFirst({
      where: { isBanned: true },
      select: { slug: true, userId: true },
    });
    if (bannedRec) {
      const attempt = await setProfileVisibilityForUser(bannedRec.userId, { action: "reactivate" });
      check("a banned recruiter cannot reactivate their page", !attempt.ok, JSON.stringify(attempt));
    } else {
      console.log("SKIP  no banned recruiter seeded for the reactivation check");
    }

    // ── Verification: submit, evidence-change withdrawal, admin approval ──
    const submitted = await submitFreelancerVerification(dev.userId);
    check("a freelancer with a work link can submit for review", submitted.ok, JSON.stringify(submitted));

    const resubmit = await submitFreelancerVerification(dev.userId);
    check("resubmitting while pending is refused", !resubmit.ok);

    // Changing the evidence mid-review withdraws the submission.
    const changed = await updateFreelancerProfileForUser(dev.userId, {
      displayName: "Sprint Dev Edited",
      headline: "Full-stack engineer for cross-stream verification",
      bio: "y".repeat(200),
      country: "PK",
      timezone: "Asia/Karachi",
      hourlyRateUsd: 50,
      isOpenToWork: true,
      githubUrl: "https://github.com/sprint-dev-CHANGED",
      portfolioUrl: null,
      linkedinUrl: null,
      skills: [
        {
          slug: (await prisma.skill.findFirstOrThrow({ select: { slug: true } })).slug,
          yearsExp: 3,
        },
      ],
    });
    check(
      "changing a work link mid-review withdraws the submission",
      changed.ok && changed.verificationWithdrawn === true,
      JSON.stringify(changed),
    );
    const afterWithdraw = await prisma.freelancerProfile.findUniqueOrThrow({
      where: { id: dev.id },
      select: { verificationSubmittedAt: true },
    });
    check("and the queue entry is gone", afterWithdraw.verificationSubmittedAt === null);

    // Submit again and approve as admin.
    check("resubmitting after withdrawal works", (await submitFreelancerVerification(dev.userId)).ok);
    const approved = await approveFreelancerWorkLinks(admin.id, dev.id);
    check("an admin can approve the work links", approved.ok, JSON.stringify(approved));

    const afterApprove = await prisma.freelancerProfile.findUniqueOrThrow({
      where: { id: dev.id },
      select: { verification: true, verifiedAt: true, verificationNote: true, verificationSubmittedAt: true },
    });
    check(
      "approval records the marker and NEVER touches the badge — the CHECK forbids a level without ID",
      afterApprove.verification === "NONE" &&
        afterApprove.verifiedAt === null &&
        afterApprove.verificationNote?.startsWith("approved:") === true &&
        afterApprove.verificationSubmittedAt === null,
      JSON.stringify(afterApprove),
    );

    const nonAdmin = await approveFreelancerWorkLinks(dev.userId, dev.id);
    check("a non-admin cannot approve", !nonAdmin.ok);

    // ── Reports ───────────────────────────────────────────────────────────
    const job = await prisma.job.findFirstOrThrow({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    const filed = await createReportForUser(dev.userId, {
      targetType: "job",
      targetId: job.id,
      reason: "asked-for-payment",
      details: "They asked for a $30 registration fee before the interview.",
    });
    check("a signed-in user can report a live job", filed.ok, JSON.stringify(filed));

    const dupe = await createReportForUser(dev.userId, {
      targetType: "job",
      targetId: job.id,
      reason: "asked-for-payment",
      details: undefined,
    });
    check("a duplicate open report on the same target is refused", !dupe.ok);

    const garbage = await createReportForUser(dev.userId, {
      targetType: "job",
      targetId: "not-a-real-job",
      reason: "other",
      details: undefined,
    });
    check("a garbage target is refused before anything is filed", !garbage.ok);

    const queued = await prisma.report.count({
      where: { reportedById: dev.userId, status: "OPEN" },
    });
    check("exactly one report reached the moderation queue", queued === 1, String(queued));
  } finally {
    await prisma.report.deleteMany({ where: { reportedById: { in: userIds } } });
    await prisma.skillOnFreelancer.deleteMany({
      where: { freelancer: { userId: { in: userIds } } },
    });
    await prisma.freelancerProfile.deleteMany({ where: { userId: { in: userIds } } });
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
