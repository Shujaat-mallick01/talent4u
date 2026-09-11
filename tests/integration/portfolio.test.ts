import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { addPortfolioItemTx, coverImagesFor, listPortfolio, reorderPortfolio } from "@/lib/db/portfolio";
import { PORTFOLIO_MAX_ITEMS } from "@/lib/validations/portfolio";

import { buildFreelancer } from "../factories";
import { truncateAll } from "./setup";

/**
 * The portfolio cap, the ordering, and the cascade — against real Postgres.
 *
 * The cap takes the same `SELECT … FOR UPDATE` the application quota and the
 * job-post cap take, for the same reason, so it gets the same kind of test: a
 * count-then-insert without a lock is not a cap, and a mocked database cannot
 * show the difference.
 */

const item = (n: number) => ({
  title: `Piece ${n}`,
  description: null,
  imageUrl: `https://sb.test/portfolio/u/${n}.png`,
  linkUrl: null,
});

beforeEach(async () => {
  await truncateAll();
});

describe("the portfolio cap, against real Postgres", () => {
  it(`allows exactly ${PORTFOLIO_MAX_ITEMS} and refuses the next`, async () => {
    const { profile } = await buildFreelancer();

    for (let i = 0; i < PORTFOLIO_MAX_ITEMS; i += 1) {
      expect((await addPortfolioItemTx({ freelancerId: profile.id, ...item(i) })).ok).toBe(true);
    }

    expect(await addPortfolioItemTx({ freelancerId: profile.id, ...item(99) })).toMatchObject({
      ok: false,
      reason: "cap-reached",
      used: PORTFOLIO_MAX_ITEMS,
    });
    expect(await prisma.portfolioItem.count()).toBe(PORTFOLIO_MAX_ITEMS);
  });

  /**
   * HONEST LABEL: this asserts the invariant, it does NOT reliably prove the
   * lock. Read before trusting it.
   *
   * The race is real and was measured. Running `addPortfolioItemTx` directly
   * with the `FOR UPDATE` deleted: 10 concurrent calls let 5 through for a
   * total of 16 against a cap of 12, and 20 let 10 through for a total of 21.
   * The cap genuinely does not hold without the lock.
   *
   * But inside this harness it could not be made to fail — with the lock
   * removed and the Vite cache cleared, this test still passed at 5 and at 12
   * concurrent. Prisma's pool and Vitest's timing serialise the transactions
   * often enough that the window closes. It is a nondeterministic race, so a
   * green run here is not evidence the lock is present.
   *
   * What DOES discriminate is `application-quota.test.ts`: removing that
   * transaction's `FOR UPDATE` fails it every time, because `applyToJob` awaits
   * three round trips before opening its transaction and the calls overlap
   * properly. That test is the proof the pattern works; this one is a smoke
   * test that the cap holds in ordinary use.
   *
   * To make this one bite, the setup would need to force overlap — a barrier
   * that holds every transaction open until all have started. That is worth
   * doing and is not done here.
   */
  it("holds under concurrency: 11 held, 12 fired at once, exactly 1 lands", async () => {
    const { profile } = await buildFreelancer();
    for (let i = 0; i < PORTFOLIO_MAX_ITEMS - 1; i += 1) {
      await addPortfolioItemTx({ freelancerId: profile.id, ...item(i) });
    }

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        addPortfolioItemTx({ freelancerId: profile.id, ...item(100 + i) }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.portfolioItem.count()).toBe(PORTFOLIO_MAX_ITEMS);
  });

  it("caps each freelancer separately — the lock is per profile, not global", async () => {
    const a = await buildFreelancer();
    const b = await buildFreelancer();

    for (let i = 0; i < PORTFOLIO_MAX_ITEMS; i += 1) {
      await addPortfolioItemTx({ freelancerId: a.profile.id, ...item(i) });
    }

    expect((await addPortfolioItemTx({ freelancerId: b.profile.id, ...item(0) })).ok).toBe(true);
  });
});

describe("ordering", () => {
  it("appends rather than reordering what is already there", async () => {
    const { profile } = await buildFreelancer();
    for (let i = 0; i < 3; i += 1) {
      await addPortfolioItemTx({ freelancerId: profile.id, ...item(i) });
    }

    expect((await listPortfolio(profile.id)).map((r) => r.title)).toEqual([
      "Piece 0",
      "Piece 1",
      "Piece 2",
    ]);
  });

  it("rewrites positions from the given order", async () => {
    const { profile } = await buildFreelancer();
    for (let i = 0; i < 3; i += 1) {
      await addPortfolioItemTx({ freelancerId: profile.id, ...item(i) });
    }
    const before = await listPortfolio(profile.id);

    await reorderPortfolio(profile.id, [before[2].id, before[0].id, before[1].id]);

    expect((await listPortfolio(profile.id)).map((r) => r.title)).toEqual([
      "Piece 2",
      "Piece 0",
      "Piece 1",
    ]);
  });

  it("cannot reorder another freelancer's items", async () => {
    const a = await buildFreelancer();
    const b = await buildFreelancer();
    await addPortfolioItemTx({ freelancerId: a.profile.id, ...item(0) });
    const [theirs] = await listPortfolio(a.profile.id);

    // b names a's item. Scoped by freelancerId, so nothing matches.
    expect(await reorderPortfolio(b.profile.id, [theirs.id])).toBe(0);
    expect((await listPortfolio(a.profile.id))[0].position).toBe(0);
  });
});

describe("cover images for the directory", () => {
  it("returns the lowest-positioned item per freelancer, in one query", async () => {
    const a = await buildFreelancer();
    const b = await buildFreelancer();
    for (let i = 0; i < 3; i += 1) {
      await addPortfolioItemTx({ freelancerId: a.profile.id, ...item(i) });
    }
    await addPortfolioItemTx({ freelancerId: b.profile.id, ...item(7) });

    const covers = await coverImagesFor([a.profile.id, b.profile.id]);

    expect(covers.get(a.profile.id)).toBe("https://sb.test/portfolio/u/0.png");
    expect(covers.get(b.profile.id)).toBe("https://sb.test/portfolio/u/7.png");
  });

  it("omits a freelancer with no portfolio rather than inventing a placeholder", async () => {
    const { profile } = await buildFreelancer();
    expect((await coverImagesFor([profile.id])).has(profile.id)).toBe(false);
  });

  it("returns an empty map for no ids, without querying", async () => {
    expect((await coverImagesFor([])).size).toBe(0);
  });
});

describe("the database's own guarantees", () => {
  it("cascades: deleting the profile takes its portfolio with it", async () => {
    const { profile } = await buildFreelancer();
    await addPortfolioItemTx({ freelancerId: profile.id, ...item(0) });
    expect(await prisma.portfolioItem.count()).toBe(1);

    await prisma.freelancerProfile.delete({ where: { id: profile.id } });

    expect(await prisma.portfolioItem.count()).toBe(0);
  });

  it("refuses a blank title or image, whatever the service believed", async () => {
    const { profile } = await buildFreelancer();

    await expect(
      prisma.portfolioItem.create({
        data: { freelancerId: profile.id, title: "   ", imageUrl: "https://x.test/a.png" },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.portfolioItem.create({
        data: { freelancerId: profile.id, title: "Fine", imageUrl: "" },
      }),
    ).rejects.toThrow();
  });

  it("refuses a negative position", async () => {
    const { profile } = await buildFreelancer();
    await expect(
      prisma.portfolioItem.create({
        data: {
          freelancerId: profile.id,
          title: "Fine",
          imageUrl: "https://x.test/a.png",
          position: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it("has RLS enabled, like every other table", async () => {
    // The rule added to CLAUDE.md after the lockdown: a new table without RLS
    // is world-writable through PostgREST from the moment it exists.
    const [row] = await prisma.$queryRaw<{ rls: boolean }[]>`
      SELECT c.relrowsecurity AS rls FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'PortfolioItem'
    `;
    expect(row.rls).toBe(true);
  });
});
