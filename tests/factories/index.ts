import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";

/**
 * Typed builders for integration tests.
 *
 * Tests never read seed data. The seed is 140-odd realistic rows tuned for
 * looking at in a browser, and a test that asserts against it is really
 * asserting "the seed still has the shape it had in August" — it breaks when
 * the seed is improved and passes when the code is broken.
 *
 * Every builder takes overrides and fills the rest with something valid,
 * because the schema has CHECK constraints that reject half-built rows
 * (`job_active_requires_published_at`, `job_budget_range_ordered`,
 * `job_onsite_requires_location`) and a test should fail on the rule it is
 * testing, never on a missing column.
 */

let counter = 0;
const uniq = (prefix: string) => `${prefix}-${(counter += 1)}-${Date.now().toString(36)}`;

export async function buildCategory(over: { slug?: string; name?: string } = {}) {
  const slug = over.slug ?? uniq("cat");
  return prisma.category.upsert({
    where: { slug },
    update: {},
    create: { slug, name: over.name ?? "Full-stack web" },
  });
}

export async function buildFreelancer(
  over: { plan?: "FREE" | "FREELANCER_PRO"; displayName?: string } = {},
) {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: { id, email: `${uniq("freelancer")}@example.test`, role: "FREELANCER" },
  });

  const profile = await prisma.freelancerProfile.create({
    data: {
      userId: id,
      slug: uniq("fl"),
      displayName: over.displayName ?? "Test Freelancer",
      headline: "Senior developer for integration tests",
      bio: "b".repeat(120),
      country: "PK",
      timezone: "Asia/Karachi",
    },
  });

  if (over.plan && over.plan !== "FREE") {
    await prisma.subscription.create({
      data: {
        userId: id,
        plan: over.plan,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  return { user, profile };
}

export async function buildRecruiter(
  over: { tier?: "UNVERIFIED" | "VERIFIED" | "TRUSTED"; plan?: string } = {},
) {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: { id, email: `${uniq("recruiter")}@example.test`, role: "RECRUITER" },
  });

  const profile = await prisma.recruiterProfile.create({
    data: {
      userId: id,
      slug: uniq("co"),
      companyName: "Test Company Ltd",
      country: "GB",
      tier: over.tier ?? "VERIFIED",
    },
  });

  return { user, profile };
}

export async function buildJob(over: {
  recruiterId: string;
  categoryId: string;
  status?: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "CLOSED" | "REMOVED";
  /** How long ago it was published. Default is well outside the early-access window. */
  publishedAgoHours?: number;
  recruiterTier?: "UNVERIFIED" | "VERIFIED" | "TRUSTED";
  title?: string;
}) {
  const status = over.status ?? "ACTIVE";
  const agoHours = over.publishedAgoHours ?? 48;
  // job_active_requires_published_at: an ACTIVE row must carry one.
  const publishedAt =
    status === "ACTIVE" || status === "CLOSED"
      ? new Date(Date.now() - agoHours * 60 * 60 * 1000)
      : null;

  return prisma.job.create({
    data: {
      recruiterId: over.recruiterId,
      categoryId: over.categoryId,
      slug: uniq("job"),
      title: over.title ?? "Integration test role",
      description: "d".repeat(200),
      status,
      publishedAt,
      engagementType: "HOURLY",
      // job_budget_range_ordered + job_budget_non_negative
      budgetMinUsd: 2000,
      budgetMaxUsd: 6000,
      // job_onsite_requires_location — remote sidesteps it.
      isRemote: true,
      recruiterTier: over.recruiterTier ?? "VERIFIED",
    },
  });
}

/** A freelancer, a company, a category and N published jobs — the usual setup. */
export async function buildMarketplace(jobCount = 1) {
  const category = await buildCategory();
  const recruiter = await buildRecruiter();
  const freelancer = await buildFreelancer();
  const jobs = [];
  for (let i = 0; i < jobCount; i += 1) {
    jobs.push(
      await buildJob({ recruiterId: recruiter.profile.id, categoryId: category.id }),
    );
  }
  return { category, recruiter, freelancer, jobs };
}
