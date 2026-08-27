import { prisma } from "../lib/db/client";
import {
  DIGEST_INTERVAL_DAYS,
  listFreelancersDueDigest,
  markDigestSent,
  matchingJobsForDigest,
  resubscribeByToken,
  setJobDigestOptIn,
  unsubscribeByToken,
} from "../lib/db/digest";

/**
 * The weekly digest against the real database, plus the scheduled route's
 * authorization over real HTTP.
 *
 * Two things here cannot be checked with a mock:
 *
 *  - The selection predicate. "Due" is a compound of opt-in, a live profile
 *    and a timestamp older than an interval, and the whole feature's
 *    idempotence rests on it. A wrong predicate means either silence or
 *    mailing the same person every run.
 *  - The route refusing an unauthenticated caller. This endpoint can mail
 *    every freelancer on the platform; "the secret check works" is not
 *    something to take on trust.
 *
 * Everything it changes, it puts back.
 *
 *   npm run dev
 *   npx tsx --env-file=.env prisma/verify-digest.ts
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CRON_SECRET = (process.env.CRON_SECRET ?? "").trim();

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const now = new Date();

  const subject = await prisma.user.findFirstOrThrow({
    where: { role: "FREELANCER", freelancer: { isNot: null } },
    select: {
      id: true,
      email: true,
      jobDigestOptIn: true,
      unsubscribeToken: true,
      lastJobDigestAt: true,
      freelancer: { select: { id: true, deactivatedAt: true } },
    },
  });
  const before = {
    optIn: subject.jobDigestOptIn,
    token: subject.unsubscribeToken,
    lastAt: subject.lastJobDigestAt,
    deactivatedAt: subject.freelancer!.deactivatedAt,
  };

  const isDue = async () =>
    (await listFreelancersDueDigest(now, 500)).some((r) => r.userId === subject.id);

  try {
    // ── Who is due ────────────────────────────────────────────────────────
    await prisma.user.update({
      where: { id: subject.id },
      data: { jobDigestOptIn: true, lastJobDigestAt: null },
    });
    check("an opted-in freelancer who has never been mailed is due", await isDue());

    await prisma.user.update({
      where: { id: subject.id },
      data: { lastJobDigestAt: new Date(now.getTime() - 1 * DAY) },
    });
    check("somebody mailed yesterday is not", !(await isDue()));

    await prisma.user.update({
      where: { id: subject.id },
      data: { lastJobDigestAt: new Date(now.getTime() - (DIGEST_INTERVAL_DAYS + 1) * DAY) },
    });
    check("somebody mailed longer ago than the interval is due again", await isDue());

    await setJobDigestOptIn(subject.id, false);
    check("an opted-out account is never due", !(await isDue()));
    await setJobDigestOptIn(subject.id, true);

    await prisma.freelancerProfile.update({
      where: { id: subject.freelancer!.id },
      data: { deactivatedAt: new Date() },
    });
    // Somebody who took their page down has stepped away; a weekly job email
    // is exactly what they asked to stop.
    check("a deactivated profile is never due", !(await isDue()));
    await prisma.freelancerProfile.update({
      where: { id: subject.freelancer!.id },
      data: { deactivatedAt: null },
    });

    // ── Marking, and the token ────────────────────────────────────────────
    await prisma.user.update({
      where: { id: subject.id },
      data: { lastJobDigestAt: null, unsubscribeToken: null },
    });

    const token = await markDigestSent(subject.id, now);
    check("marking issues an unsubscribe token", token.length >= 16, `${token.length} chars`);
    check("and the account stops being due", !(await isDue()));

    const again = await markDigestSent(subject.id, new Date(now.getTime() + 1000));
    // Rotating would silently break the link in every digest already sent.
    check("marking again does NOT rotate the token", again === token);

    // ── Unsubscribe, without a session ────────────────────────────────────
    const off = await unsubscribeByToken(token);
    check("the token turns the digest off", off?.email === subject.email);
    check(
      "and the account is opted out",
      (await prisma.user.findUniqueOrThrow({
        where: { id: subject.id },
        select: { jobDigestOptIn: true },
      })).jobDigestOptIn === false,
    );
    // People click these twice, and a mail scanner may have clicked first.
    check("clicking it again is still a success", (await unsubscribeByToken(token)) !== null);

    const back = await resubscribeByToken(token);
    check("and the same token turns it back on", back?.email === subject.email);
    check(
      "the account is opted in again",
      (await prisma.user.findUniqueOrThrow({
        where: { id: subject.id },
        select: { jobDigestOptIn: true },
      })).jobDigestOptIn === true,
    );

    check("a token nobody owns does nothing", (await unsubscribeByToken("x".repeat(32))) === null);
    check("and a too-short one is rejected before the query", (await unsubscribeByToken("abc")) === null);

    // ── Job matching ──────────────────────────────────────────────────────
    const withSkills = await prisma.freelancerProfile.findFirst({
      where: { deactivatedAt: null, skills: { some: {} } },
      select: { skills: { select: { skillId: true } } },
    });
    if (withSkills) {
      const skillIds = withSkills.skills.map((s) => s.skillId);
      const matched = await matchingJobsForDigest({
        skillIds,
        publishedAfter: new Date(now.getTime() - 365 * DAY),
        publishedBefore: now,
        limit: 6,
      });
      check("matching returns jobs for a real skill set", matched.length > 0, `${matched.length}`);
      check("never more than the limit", matched.length <= 6);
      check(
        "every one shares at least one skill",
        matched.every((j) => j.matchedSkills > 0),
      );
      check(
        "and the strongest match leads",
        matched.every((j, i) => i === 0 || matched[i - 1].matchedSkills >= j.matchedSkills),
      );

      const none = await matchingJobsForDigest({
        skillIds,
        // A window that closed before it opened.
        publishedAfter: now,
        publishedBefore: new Date(now.getTime() - DAY),
        limit: 6,
      });
      check("an empty window returns nothing", none.length === 0);

      check(
        "a profile with no skills matches nothing, without querying",
        (await matchingJobsForDigest({
          skillIds: [],
          publishedAfter: new Date(0),
          publishedBefore: now,
          limit: 6,
        })).length === 0,
      );
    }
  } finally {
    await prisma.user.update({
      where: { id: subject.id },
      data: {
        jobDigestOptIn: before.optIn,
        unsubscribeToken: before.token,
        lastJobDigestAt: before.lastAt,
      },
    });
    await prisma.freelancerProfile.update({
      where: { id: subject.freelancer!.id },
      data: { deactivatedAt: before.deactivatedAt },
    });
  }

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: subject.id },
    select: { jobDigestOptIn: true, unsubscribeToken: true, lastJobDigestAt: true },
  });
  check(
    "the account it borrowed is put back exactly",
    after.jobDigestOptIn === before.optIn &&
      after.unsubscribeToken === before.token &&
      String(after.lastJobDigestAt) === String(before.lastAt),
  );

  // ── The scheduled route, over HTTP ──────────────────────────────────────
  const call = async (headers: Record<string, string> = {}) =>
    (await fetch(`${SITE}/api/cron/job-digest`, { headers, redirect: "manual" })).status;

  if (CRON_SECRET.length === 0) {
    // The safe default: an unconfigured deployment sends nothing at all.
    check("with no secret configured the route refuses everything", (await call()) === 503);
    console.log("      (set CRON_SECRET and re-run to exercise the 401/200 paths)");
  } else {
    check("an unauthenticated call is refused", (await call()) === 401);
    check(
      "a wrong secret is refused",
      (await call({ authorization: "Bearer definitely-not-it" })) === 401,
    );
    check(
      "a secret of a different length is refused",
      (await call({ authorization: "Bearer short" })) === 401,
    );
    // A successful call RUNS the digest, which marks every due account. On a
    // seeded database that is real drift, so the whole column is snapshotted
    // and restored around it.
    const snapshot = await prisma.user.findMany({
      select: { id: true, lastJobDigestAt: true, unsubscribeToken: true },
    });
    try {
      check(
        "the real secret is accepted",
        (await call({ authorization: `Bearer ${CRON_SECRET}` })) === 200,
      );
    } finally {
      for (const row of snapshot) {
        await prisma.user.update({
          where: { id: row.id },
          data: { lastJobDigestAt: row.lastJobDigestAt, unsubscribeToken: row.unsubscribeToken },
        });
      }
    }
    const restored = await prisma.user.count({ where: { lastJobDigestAt: { not: null } } });
    const originally = snapshot.filter((r) => r.lastJobDigestAt !== null).length;
    check("and the run it triggered is rolled back", restored === originally, `${restored} vs ${originally}`);
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
