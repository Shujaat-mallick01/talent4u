import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db/client";
import { anonymiseAccount, isDeleted } from "../lib/db/account-deletion";
import { searchCandidates } from "../lib/db/candidate-search";
import { getUserAuthStateFresh } from "../lib/db/users";

/**
 * Account deletion, against the real database.
 *
 * The whole design rests on one claim that a mocked test cannot make: the
 * PERSON is erased and the SHARED RECORD survives. If the anonymising
 * transaction quietly cascades — a foreign key set to CASCADE where it should
 * Restrict, a delete where there should be an update — then a recruiter loses
 * the evidence behind a hire and a review loses the person it was about, and
 * nothing in the type system notices.
 *
 * So this builds a real account with real history, deletes it, and checks both
 * halves: that nothing identifying remains, and that everything shared does.
 *
 * Everything it creates, it removes.
 *
 *   npx tsx --env-file=.env prisma/verify-account-deletion.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const tag = randomUUID().slice(0, 8);
  const userId = randomUUID();
  const email = `delete-${tag}@talent4u.test`;

  const job = await prisma.job.findFirstOrThrow({
    where: { status: "ACTIVE" },
    select: { id: true, recruiterId: true },
  });
  const skills = await prisma.skill.findMany({ select: { id: true }, take: 3 });

  let profileId = "";
  let applicationId = "";

  try {
    // ── A real account, with real history ─────────────────────────────────
    await prisma.user.create({ data: { id: userId, email, role: "FREELANCER" } });
    const profile = await prisma.freelancerProfile.create({
      data: {
        userId,
        slug: `delete-me-${tag}`,
        displayName: "Deletable Person",
        headline: "Senior widget engineer who is about to leave",
        bio: "x".repeat(200),
        country: "GB",
        timezone: "Europe/London",
        hourlyRateUsd: 90,
        githubUrl: "https://github.com/deletable",
        portfolioUrl: "https://deletable.dev",
        linkedinUrl: "https://linkedin.com/in/deletable",
        avatarUrl: "https://example.invalid/avatar.png",
        searchBoost: true,
        skills: { create: skills.map((s) => ({ skillId: s.id })) },
      },
      select: { id: true },
    });
    profileId = profile.id;

    const application = await prisma.application.create({
      data: {
        jobId: job.id,
        freelancerId: profileId,
        coverLetter: "This application is shared history and must survive deletion.",
        proposedRateUsd: 90,
        status: "SHORTLISTED",
      },
      select: { id: true },
    });
    applicationId = application.id;

    check("the fixture account exists and can be looked up", (await getUserAuthStateFresh(userId)) !== null);

    const before = await searchCandidates({ q: "widget" });
    check(
      "and is findable in candidate search",
      before.candidates.some((c) => c.id === profileId),
    );

    // ── Delete ────────────────────────────────────────────────────────────
    const summary = await anonymiseAccount(userId);
    check("deletion reports who it was", summary.wasNamed === "Deletable Person");

    // ── The person is gone ────────────────────────────────────────────────
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, deletedAt: true, jobDigestOptIn: true, unsubscribeToken: true },
    });
    check("the email no longer identifies anybody", !user.email.includes(tag), user.email);
    check("and points at an unroutable domain", user.email.endsWith(".invalid"));
    check("the account is flagged deleted", user.deletedAt !== null);
    check("and will never be mailed again", user.jobDigestOptIn === false && user.unsubscribeToken === null);

    const scrubbed = await prisma.freelancerProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: {
        displayName: true,
        headline: true,
        bio: true,
        avatarUrl: true,
        githubUrl: true,
        portfolioUrl: true,
        linkedinUrl: true,
        hourlyRateUsd: true,
        deactivatedAt: true,
        searchBoost: true,
        skills: { select: { skillId: true } },
      },
    });
    check("the name is a placeholder", scrubbed.displayName === "Deleted account");
    check(
      "every link and the avatar are gone",
      scrubbed.githubUrl === null &&
        scrubbed.portfolioUrl === null &&
        scrubbed.linkedinUrl === null &&
        scrubbed.avatarUrl === null,
    );
    check("the rate is gone", scrubbed.hourlyRateUsd === null);
    check("the old bio and headline are gone", !scrubbed.bio.startsWith("x") && !scrubbed.headline.includes("widget"));
    check("the skills are gone", scrubbed.skills.length === 0, `${scrubbed.skills.length} left`);
    check("the public page is down", scrubbed.deactivatedAt !== null);
    check("and any Pro ranking boost is off", scrubbed.searchBoost === false);

    // ── Every door is shut ────────────────────────────────────────────────
    check("the auth boundary refuses the account", (await getUserAuthStateFresh(userId)) === null);
    check("isDeleted agrees", await isDeleted(userId));

    const after = await searchCandidates({ q: "widget" });
    check(
      "candidate search cannot find them by their old headline",
      !after.candidates.some((c) => c.id === profileId),
    );
    const anyList = await searchCandidates({});
    check(
      "nor by listing everyone",
      !anyList.candidates.some((c) => c.id === profileId),
    );

    // ── The shared record survives ────────────────────────────────────────
    //
    // The half that matters most. A recruiter shortlisted this person; that
    // fact belongs to the recruiter too, and deleting it would rewrite their
    // record of their own hiring.
    const survived = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { status: true, coverLetter: true, freelancerId: true, jobId: true },
    });
    check("the application still exists", survived !== null);
    check("it still points at the (now anonymous) profile", survived?.freelancerId === profileId);
    check("its status is untouched", survived?.status === "SHORTLISTED");
    check("and the job it was sent to is untouched", survived?.jobId === job.id);
    check(
      "the job itself still exists",
      (await prisma.job.count({ where: { id: job.id } })) === 1,
    );
  } finally {
    if (applicationId) await prisma.application.deleteMany({ where: { id: applicationId } });
    if (profileId) {
      await prisma.skillOnFreelancer.deleteMany({ where: { freelancerId: profileId } });
      await prisma.freelancerProfile.deleteMany({ where: { id: profileId } });
    }
    await prisma.user.deleteMany({ where: { id: userId } });
  }

  const leftovers = await prisma.user.count({ where: { id: userId } });
  check("the fixture is gone again", leftovers === 0);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
