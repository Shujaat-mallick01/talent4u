import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db/client";
import {
  freelancersWhoHeardBack,
  jobsWithEarlyTraction,
  marketplaceScale,
  recruitersWhoPostedAgain,
} from "../lib/db/metrics";

/**
 * The health metrics, against controlled data.
 *
 * All three are raw SQL whose correctness is entirely in a time window that is
 * relative to each row's own start — 48 hours after THIS job was published, 60
 * days after THIS company's first post. An off-by-one in a window does not
 * throw and does not look wrong; it just quietly reports a different number
 * than the one on the label, forever.
 *
 * So this builds rows on both sides of each boundary and checks the ratio
 * moves by exactly the amount it should. Everything it creates, it deletes.
 *
 *   npx tsx --env-file=.env prisma/verify-metrics.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

async function main() {
  const tag = randomUUID().slice(0, 8);
  const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
  const recruiter = await prisma.recruiterProfile.findFirstOrThrow({ select: { id: true } });
  const freelancers = await prisma.freelancerProfile.findMany({
    select: { id: true },
    take: 6,
  });
  if (freelancers.length < 6) throw new Error("need at least six freelancer profiles in the seed");

  const jobIds: string[] = [];
  const newRecruiterIds: string[] = [];

  const makeJob = async (args: { publishedAt: Date; recruiterId: string }) => {
    const job = await prisma.job.create({
      data: {
        slug: `metrics-${tag}-${jobIds.length}`,
        recruiterId: args.recruiterId,
        title: `Metrics fixture ${tag}`,
        description: "Created by prisma/verify-metrics.ts. Removed at the end of the run.",
        categoryId: category.id,
        engagementType: "HOURLY",
        status: "ACTIVE",
        publishedAt: args.publishedAt,
      },
      select: { id: true },
    });
    jobIds.push(job.id);
    return job.id;
  };

  const apply = (jobId: string, freelancerId: string, createdAt: Date) =>
    prisma.application.create({
      data: { jobId, freelancerId, coverLetter: "Fixture.", createdAt },
      select: { id: true },
    });

  try {
    // ── 1. Traction: 5+ applications inside 48 hours ──────────────────────
    const base = await jobsWithEarlyTraction();

    // A job published 3 days ago, so it HAS had its window.
    const publishedAt = ago(3 * DAY);
    const jobA = await makeJob({ publishedAt, recruiterId: recruiter.id });

    // Four inside the window, one just outside it.
    for (let i = 0; i < 4; i += 1) {
      await apply(jobA, freelancers[i].id, new Date(publishedAt.getTime() + (i + 1) * HOUR));
    }
    await apply(jobA, freelancers[4].id, new Date(publishedAt.getTime() + 49 * HOUR));

    const nearMiss = await jobsWithEarlyTraction();
    check(
      "a job with four in the window and one outside it counts as a miss",
      nearMiss.total === base.total + 1 && nearMiss.hit === base.hit,
      `${nearMiss.hit}/${nearMiss.total} vs ${base.hit}/${base.total}`,
    );

    // The fifth, inside the window this time.
    await apply(jobA, freelancers[5].id, new Date(publishedAt.getTime() + 47 * HOUR));
    const hit = await jobsWithEarlyTraction();
    check(
      "the fifth inside the window flips it to a hit",
      hit.hit === base.hit + 1 && hit.total === base.total + 1,
      `${hit.hit}/${hit.total}`,
    );

    // A job published an hour ago has not failed — it has not had 48 hours.
    await makeJob({ publishedAt: ago(1 * HOUR), recruiterId: recruiter.id });
    const fresh = await jobsWithEarlyTraction();
    check(
      "a job published an hour ago is not counted against us",
      fresh.total === hit.total,
      `${fresh.total} vs ${hit.total}`,
    );

    // ── 2. Repeat posting within 60 days ──────────────────────────────────
    const baseRepeat = await recruitersWhoPostedAgain();

    const makeRecruiter = async (label: string) => {
      const userId = randomUUID();
      await prisma.user.create({
        data: { id: userId, email: `metrics-${label}-${tag}@talent4u.test`, role: "RECRUITER" },
      });
      const profile = await prisma.recruiterProfile.create({
        data: {
          userId,
          slug: `metrics-${label}-${tag}`,
          companyName: `Metrics ${label} ${tag}`,
          country: "GB",
        },
        select: { id: true },
      });
      newRecruiterIds.push(profile.id);
      return { profileId: profile.id, userId };
    };

    // Posted twice, 30 days apart, starting 90 days ago.
    const repeater = await makeRecruiter("repeat");
    await makeJob({ publishedAt: ago(90 * DAY), recruiterId: repeater.profileId });
    await makeJob({ publishedAt: ago(60 * DAY), recruiterId: repeater.profileId });

    // Posted twice, but the second one 70 days later — outside the window.
    const straggler = await makeRecruiter("late");
    await makeJob({ publishedAt: ago(150 * DAY), recruiterId: straggler.profileId });
    await makeJob({ publishedAt: ago(80 * DAY), recruiterId: straggler.profileId });

    // Posted once, 10 days ago: has not had the 60 days yet.
    const newcomer = await makeRecruiter("new");
    await makeJob({ publishedAt: ago(10 * DAY), recruiterId: newcomer.profileId });

    const repeat = await recruitersWhoPostedAgain();
    check(
      "a company that posted again inside 60 days counts, one that took 70 does not",
      repeat.hit === baseRepeat.hit + 1 && repeat.total === baseRepeat.total + 2,
      `${repeat.hit}/${repeat.total} vs ${baseRepeat.hit}/${baseRepeat.total}`,
    );
    check(
      "and a company whose only post is 10 days old is not in the denominator",
      repeat.total === baseRepeat.total + 2,
    );

    // ── 3. Heard back ─────────────────────────────────────────────────────
    // Not constructed here: the decision timestamp is Application.updatedAt,
    // which Prisma owns and overwrites on every write, so a fixture cannot
    // place one inside a past window without lying about how the column
    // behaves in production. What IS checked is that the query runs and is
    // internally coherent.
    const heard = await freelancersWhoHeardBack();
    check("the heard-back query runs", Number.isInteger(heard.hit) && Number.isInteger(heard.total));
    check("and never claims more hits than the population", heard.hit <= heard.total);

    // ── Scale ─────────────────────────────────────────────────────────────
    const scale = await marketplaceScale();
    check(
      "scale counts the jobs this run added",
      scale.publishedJobs >= jobIds.length,
      `${scale.publishedJobs} published`,
    );
    check(
      "and never reports more companies posting than jobs published",
      scale.companiesWhoPosted <= scale.publishedJobs,
    );
  } finally {
    await prisma.application.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    for (const id of newRecruiterIds) {
      const row = await prisma.recruiterProfile.findUnique({
        where: { id },
        select: { userId: true },
      });
      await prisma.recruiterProfile.deleteMany({ where: { id } });
      if (row) await prisma.user.deleteMany({ where: { id: row.userId } });
    }
  }

  const leftovers = await prisma.job.count({ where: { slug: { startsWith: `metrics-${tag}` } } });
  check("everything it created is gone again", leftovers === 0, `${leftovers} left`);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
