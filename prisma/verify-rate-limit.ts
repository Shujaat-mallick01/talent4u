import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db/client";
import {
  clearRateLimit,
  hitRateLimit,
  pruneRateLimits,
  rateLimitKey,
} from "../lib/db/rate-limit";

/**
 * The rate limiter against the real database.
 *
 * One thing here matters more than everything else: the counter has to be
 * ATOMIC. A rate limiter built on read-then-write lets a burst straight
 * through — precisely when a burst is the thing being defended against — and
 * it does it silently, so the limiter looks like it is working right up until
 * somebody actually attacks it. That property is a claim about
 * `INSERT ... ON CONFLICT DO UPDATE` under concurrency, and the only way to
 * check a claim about Postgres is to ask Postgres.
 *
 * Everything it writes, it deletes.
 *
 *   npx tsx --env-file=.env prisma/verify-rate-limit.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tag = randomUUID().slice(0, 8);
  const keys: string[] = [];
  const keyFor = (name: string) => {
    const k = rateLimitKey(`verify-${name}`, tag);
    keys.push(k);
    return k;
  };

  try {
    // ── Counting ──────────────────────────────────────────────────────────
    const counting = keyFor("count");
    const first = await hitRateLimit(counting, 60);
    check("the first hit starts the window at one", first.count === 1, `count=${first.count}`);

    const second = await hitRateLimit(counting, 60);
    check("the second increments", second.count === 2, `count=${second.count}`);
    check(
      "and stays inside the same window",
      second.windowStart.getTime() === first.windowStart.getTime(),
    );

    // ── Atomicity ─────────────────────────────────────────────────────────
    //
    // Fifty at once on one key. A read-then-write implementation loses
    // increments here and reports something short of fifty; the atomic one
    // cannot, because each statement re-reads the row it is locking.
    const burstKey = keyFor("burst");
    const BURST = 50;
    const results = await Promise.all(
      Array.from({ length: BURST }, () => hitRateLimit(burstKey, 60)),
    );
    const highest = Math.max(...results.map((r) => r.count));
    const distinct = new Set(results.map((r) => r.count)).size;

    check(`${BURST} concurrent hits reach exactly ${BURST}`, highest === BURST, `highest=${highest}`);
    check(
      "and every one of them saw a different number",
      distinct === BURST,
      `${distinct} distinct of ${BURST}`,
    );

    const stored = await prisma.rateLimit.findUniqueOrThrow({
      where: { key: burstKey },
      select: { count: true },
    });
    check("the stored count agrees", stored.count === BURST, `${stored.count}`);

    // Repeat it: a race that only fails sometimes is worse than one that
    // always does, because it survives the first run of a test suite.
    let stable = 0;
    for (let round = 0; round < 4; round += 1) {
      const k = rateLimitKey(`verify-burst-${round}`, tag);
      keys.push(k);
      const r = await Promise.all(Array.from({ length: 25 }, () => hitRateLimit(k, 60)));
      if (Math.max(...r.map((x) => x.count)) === 25) stable += 1;
    }
    check("and it holds across repeated rounds", stable === 4, `${stable}/4`);

    // ── The window rolling over ───────────────────────────────────────────
    const rolling = keyFor("window");
    await hitRateLimit(rolling, 1);
    const beforeRoll = await hitRateLimit(rolling, 1);
    check("two hits inside a one-second window count two", beforeRoll.count === 2);

    await sleep(1300);
    const afterRoll = await hitRateLimit(rolling, 1);
    check("a hit after the window resets to one", afterRoll.count === 1, `count=${afterRoll.count}`);
    check(
      "and opens a new window",
      afterRoll.windowStart.getTime() > beforeRoll.windowStart.getTime(),
    );

    // ── Clearing, for a successful sign-in ────────────────────────────────
    const clearing = keyFor("clear");
    await hitRateLimit(clearing, 60);
    await hitRateLimit(clearing, 60);
    await clearRateLimit(clearing);
    const afterClear = await hitRateLimit(clearing, 60);
    check("clearing forgets the count entirely", afterClear.count === 1);

    // ── Keys are not readable ─────────────────────────────────────────────
    const emailKey = rateLimitKey("sign-in", "someone@example.com");
    check(
      "a key holding an email does not contain it",
      !emailKey.includes("someone") && !emailKey.includes("example.com"),
      emailKey,
    );
    check("but is stable for the same subject", emailKey === rateLimitKey("sign-in", "someone@example.com"));
    check(
      "and differs per action, so one bucket cannot drain another",
      rateLimitKey("apply", "u1") !== rateLimitKey("message", "u1"),
    );

    // ── Pruning ───────────────────────────────────────────────────────────
    const stale = keyFor("stale");
    await hitRateLimit(stale, 60);
    await prisma.rateLimit.update({
      where: { key: stale },
      data: { windowStart: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });
    const pruned = await pruneRateLimits(24 * 60 * 60);
    check("pruning removes a window that closed yesterday", pruned >= 1, `${pruned} removed`);
    check(
      "and leaves live ones alone",
      (await prisma.rateLimit.count({ where: { key: counting } })) === 1,
    );
  } finally {
    await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
  }

  const left = await prisma.rateLimit.count({ where: { key: { in: keys } } });
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
