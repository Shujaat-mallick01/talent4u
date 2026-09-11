import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { applyToJob } from "@/lib/services/application";

import { buildFreelancer, buildJob, buildMarketplace } from "../factories";
import { truncateAll } from "./setup";

/**
 * The rule this file exists for: **12 applications per rolling 30 days.**
 *
 * It was the single largest gap in the suite. `applyToJobTx` — the transaction
 * that takes `SELECT ... FOR UPDATE` on the freelancer's row, counts, and
 * inserts — was `vi.fn()` in every existing test. Nothing anywhere proved the
 * lock actually stops a 13th concurrent application, which is the only thing
 * standing between the free tier and unlimited applications.
 *
 * A mocked test cannot prove this even in principle. The count-then-insert race
 * only exists across real connections against real Postgres; mock the database
 * and you are asserting that the code calls a function you wrote.
 */

const COVER_LETTER = "c".repeat(200);

const apply = (userId: string, slug: string) =>
  applyToJob(userId, slug, { coverLetter: COVER_LETTER, proposedRateUsd: null });

beforeEach(async () => {
  await truncateAll();
});

describe("the free tier's 12-application quota, against real Postgres", () => {
  it("allows exactly 12 and refuses the 13th", async () => {
    const { freelancer, recruiter, category } = await buildMarketplace(0);
    const jobs = [];
    for (let i = 0; i < 13; i += 1) {
      jobs.push(await buildJob({ recruiterId: recruiter.profile.id, categoryId: category.id }));
    }

    const results = [];
    for (const job of jobs) results.push(await apply(freelancer.user.id, job.slug));

    expect(results.slice(0, 12).every((r) => r.ok)).toBe(true);
    expect(results[12]).toMatchObject({ ok: false, reason: "quota-exceeded", limit: 12, used: 12 });
    expect(await prisma.application.count()).toBe(12);
  });

  /**
   * The one that matters. Eleven applications already used, then five fired at
   * once at five different jobs.
   *
   * Without the row lock every one of them reads `used = 11`, every one decides
   * it is under the limit, and the freelancer ends with 16. The unique
   * constraint does not help — these are five DIFFERENT jobs, so
   * `@@unique([jobId, freelancerId])` is satisfied by all of them.
   *
   * With `SELECT ... FOR UPDATE` on the freelancer's profile row as the first
   * statement of the transaction, they serialise: one commits and the rest
   * re-count after it.
   */
  it("holds under concurrency: 11 used, 5 fired at once, exactly 1 gets through", async () => {
    const { freelancer, recruiter, category } = await buildMarketplace(0);

    const used = [];
    for (let i = 0; i < 11; i += 1) {
      used.push(await buildJob({ recruiterId: recruiter.profile.id, categoryId: category.id }));
    }
    for (const job of used) {
      expect((await apply(freelancer.user.id, job.slug)).ok).toBe(true);
    }
    expect(await prisma.application.count()).toBe(11);

    const contested = [];
    for (let i = 0; i < 5; i += 1) {
      contested.push(
        await buildJob({ recruiterId: recruiter.profile.id, categoryId: category.id }),
      );
    }

    const results = await Promise.all(
      contested.map((job) => apply(freelancer.user.id, job.slug)),
    );

    const accepted = results.filter((r) => r.ok).length;
    const refused = results.filter((r) => !r.ok && r.reason === "quota-exceeded").length;

    expect(accepted).toBe(1);
    expect(refused).toBe(4);
    // The assertion the whole feature rests on.
    expect(await prisma.application.count()).toBe(12);
  });

  it("counts WITHDRAWN and REJECTED rows — withdrawing does not refund quota", async () => {
    const { freelancer, recruiter, category } = await buildMarketplace(0);
    const jobs = [];
    for (let i = 0; i < 13; i += 1) {
      jobs.push(await buildJob({ recruiterId: recruiter.profile.id, categoryId: category.id }));
    }
    for (let i = 0; i < 12; i += 1) await apply(freelancer.user.id, jobs[i].slug);

    // Every status the enum allows, on rows already inside the window.
    await prisma.application.updateMany({
      where: { jobId: jobs[0].id },
      data: { status: "WITHDRAWN" },
    });
    await prisma.application.updateMany({
      where: { jobId: jobs[1].id },
      data: { status: "REJECTED" },
    });

    // Still refused: the count filters on createdAt only, never on status.
    expect(await apply(freelancer.user.id, jobs[12].slug)).toMatchObject({
      ok: false,
      reason: "quota-exceeded",
    });
  });

  it("ignores applications older than the 30-day window", async () => {
    const { freelancer, recruiter, category } = await buildMarketplace(0);
    const jobs = [];
    for (let i = 0; i < 13; i += 1) {
      jobs.push(await buildJob({ recruiterId: recruiter.profile.id, categoryId: category.id }));
    }
    for (let i = 0; i < 12; i += 1) await apply(freelancer.user.id, jobs[i].slug);

    // Push two of them just outside the rolling window.
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.application.updateMany({
      where: { jobId: { in: [jobs[0].id, jobs[1].id] } },
      data: { createdAt: old },
    });

    expect((await apply(freelancer.user.id, jobs[12].slug)).ok).toBe(true);
    expect(await prisma.application.count()).toBe(13);
  });

  it("does not apply the quota to Pro", async () => {
    const category = await (await import("../factories")).buildCategory();
    const recruiter = await (await import("../factories")).buildRecruiter();
    const pro = await buildFreelancer({ plan: "FREELANCER_PRO" });

    for (let i = 0; i < 14; i += 1) {
      const job = await buildJob({ recruiterId: recruiter.profile.id, categoryId: category.id });
      expect((await apply(pro.user.id, job.slug)).ok).toBe(true);
    }
    expect(await prisma.application.count()).toBe(14);
  });

  it("refuses a second application to the same job", async () => {
    const { freelancer, jobs } = await buildMarketplace(1);
    expect((await apply(freelancer.user.id, jobs[0].slug)).ok).toBe(true);
    expect(await apply(freelancer.user.id, jobs[0].slug)).toMatchObject({
      ok: false,
      reason: "already-applied",
    });
    expect(await prisma.application.count()).toBe(1);
  });

  it("refuses a job still inside the early-access window, for a free freelancer", async () => {
    const { freelancer, recruiter, category } = await buildMarketplace(0);
    const fresh = await buildJob({
      recruiterId: recruiter.profile.id,
      categoryId: category.id,
      publishedAgoHours: 1,
    });

    // The cutoff is re-applied INSIDE the apply transaction, so a free
    // freelancer cannot apply to a job they are not allowed to see yet.
    expect(await apply(freelancer.user.id, fresh.slug)).toMatchObject({ ok: false });
    expect(await prisma.application.count()).toBe(0);
  });
});
