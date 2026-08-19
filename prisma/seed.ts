import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import type { FlagReason, PlanTier } from "../lib/generated/prisma/enums";
import { PrismaClient } from "../lib/generated/prisma/client";
import { daysAgo, hoursAgo, stableId, stableUuid } from "./seed-ids";
import type { SeedRecruiter } from "./seed-data";
import { seedData } from "./seed-data";

/**
 * Talent4u seed.
 *
 * Idempotent: every row upserts on a stable key (a slug where one exists,
 * otherwise a deterministic id from seed-ids.ts), so `npm run db:seed` can be
 * re-run freely without duplicating anything.
 *
 * Timestamps DO move on each run. That is deliberate: job publish times are
 * expressed as "hours before now" so the 6 hour early-access window stays
 * testable by eye instead of ageing out after the first day.
 *
 * Seeded users exist only in this database, not in Supabase Auth, so they
 * cannot sign in. Create real accounts through the signup flow.
 */

// Seeding writes in bulk and wants a real session, so prefer the direct
// connection over the transaction pooler when one is configured.
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Neither DIRECT_URL nor DATABASE_URL is set. Populate .env before seeding.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const now = new Date();

/** Which subscription a seeded recruiter should carry, by verification tier. */
const RECRUITER_PLAN: Record<SeedRecruiter["tier"], PlanTier> = {
  UNVERIFIED: "FREE",
  VERIFIED: "RECRUITER_GROWTH",
  TRUSTED: "RECRUITER_TEAM",
};

/**
 * Minimal stand-in for the automated flagger so the moderation queue is not
 * empty. The real implementation lands in lib/services/ in a later phase; this
 * only exists to give each PENDING_REVIEW job a coherent flag.
 */
const FLAG_TERMS: ReadonlyArray<readonly [string, FlagReason]> = [
  ["registration fee", "UPFRONT_PAYMENT"],
  ["security deposit", "UPFRONT_PAYMENT"],
  ["training fee", "UPFRONT_PAYMENT"],
  ["equipment purchase", "UPFRONT_PAYMENT"],
  ["processing fee", "UPFRONT_PAYMENT"],
  ["refundable", "UPFRONT_PAYMENT"],
  ["unpaid test", "LONG_UNPAID_TEST"],
  ["unpaid trial", "LONG_UNPAID_TEST"],
  ["test task", "LONG_UNPAID_TEST"],
  ["western union", "OFF_PLATFORM_PAYMENT"],
  ["telegram", "OFF_PLATFORM_PAYMENT"],
  ["whatsapp", "OFF_PLATFORM_PAYMENT"],
  ["crypto", "OFF_PLATFORM_PAYMENT"],
  ["usdt", "OFF_PLATFORM_PAYMENT"],
  ["gift card", "OFF_PLATFORM_PAYMENT"],
];

const detectFlag = (text: string): { term: string; reason: FlagReason } => {
  const haystack = text.toLowerCase();
  for (const [term, reason] of FLAG_TERMS) {
    if (haystack.includes(term)) return { term, reason };
  }
  return { term: "manual review", reason: "OTHER" };
};

async function main() {
  const {
    categories,
    skills,
    recruiters,
    freelancers,
    jobs,
    applications,
    engagements,
  } = seedData;

  // ── Taxonomy ─────────────────────────────────────────────────────────────
  const categoryIdBySlug = new Map<string, string>();

  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: {
        id: stableId("category", category.slug),
        slug: category.slug,
        name: category.name,
      },
    });
    categoryIdBySlug.set(row.slug, row.id);
  }

  const skillIdBySlug = new Map<string, string>();

  for (const skill of skills) {
    const row = await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {
        name: skill.name,
        categoryId: categoryIdBySlug.get(skill.categorySlug) ?? null,
      },
      create: {
        id: stableId("skill", skill.slug),
        slug: skill.slug,
        name: skill.name,
        categoryId: categoryIdBySlug.get(skill.categorySlug) ?? null,
      },
    });
    skillIdBySlug.set(row.slug, row.id);
  }

  console.log(
    `  categories: ${categoryIdBySlug.size}   skills: ${skillIdBySlug.size}`,
  );

  // ── Admin ────────────────────────────────────────────────────────────────
  // Needed so /admin has an account to test the middleware matrix against.
  await prisma.user.upsert({
    where: { email: "admin@talent4u.test" },
    update: { role: "ADMIN" },
    create: {
      id: stableUuid("user", "admin@talent4u.test"),
      email: "admin@talent4u.test",
      role: "ADMIN",
      emailVerified: now,
      billingCountry: "PK",
    },
  });

  // ── Recruiters ───────────────────────────────────────────────────────────
  const recruiterIdBySlug = new Map<string, string>();
  const recruiterTierBySlug = new Map<
    string,
    (typeof recruiters)[number]["tier"]
  >();

  for (const recruiter of recruiters) {
    const userId = stableUuid("user", recruiter.email);
    const isVerified = recruiter.tier !== "UNVERIFIED";

    await prisma.user.upsert({
      where: { email: recruiter.email },
      update: { role: "RECRUITER", billingCountry: recruiter.country },
      create: {
        id: userId,
        email: recruiter.email,
        role: "RECRUITER",
        emailVerified: now,
        billingCountry: recruiter.country,
      },
    });

    const profileFields = {
      companyName: recruiter.companyName,
      companyDomain: recruiter.companyDomain,
      registrationNo: recruiter.registrationNo,
      linkedinUrl: recruiter.linkedinUrl,
      websiteUrl: recruiter.websiteUrl,
      description: recruiter.description,
      country: recruiter.country,
      tier: recruiter.tier,
      verifiedAt: isVerified ? daysAgo(now, 120) : null,
    };

    const row = await prisma.recruiterProfile.upsert({
      where: { slug: recruiter.slug },
      update: profileFields,
      create: {
        id: stableId("recruiter", recruiter.slug),
        userId,
        slug: recruiter.slug,
        ...profileFields,
      },
    });

    recruiterIdBySlug.set(recruiter.slug, row.id);
    recruiterTierBySlug.set(recruiter.slug, recruiter.tier);

    await prisma.subscription.upsert({
      where: { userId },
      update: { plan: RECRUITER_PLAN[recruiter.tier] },
      create: {
        id: stableId("subscription", recruiter.email),
        userId,
        plan: RECRUITER_PLAN[recruiter.tier],
        status: "ACTIVE",
        priceRegion: recruiter.country,
      },
    });
  }

  console.log(`  recruiters: ${recruiterIdBySlug.size}`);

  // ── Freelancers ──────────────────────────────────────────────────────────
  const freelancerIdBySlug = new Map<string, string>();

  for (const freelancer of freelancers) {
    const userId = stableUuid("user", freelancer.email);

    await prisma.user.upsert({
      where: { email: freelancer.email },
      update: { role: "FREELANCER", billingCountry: freelancer.country },
      create: {
        id: userId,
        email: freelancer.email,
        role: "FREELANCER",
        emailVerified: now,
        billingCountry: freelancer.country,
      },
    });

    const profileFields = {
      displayName: freelancer.displayName,
      headline: freelancer.headline,
      bio: freelancer.bio,
      hourlyRateUsd: freelancer.hourlyRateUsd,
      country: freelancer.country,
      timezone: freelancer.timezone,
      verification: freelancer.verification,
      githubUrl: freelancer.githubUrl,
      portfolioUrl: freelancer.portfolioUrl,
      linkedinUrl: freelancer.linkedinUrl,
      isOpenToWork: freelancer.isOpenToWork,
      // searchBoost mirrors "has an active Pro subscription". In production the
      // Stripe webhook is the single writer; here the seed data says so directly.
      searchBoost: freelancer.isPro,
    };

    const row = await prisma.freelancerProfile.upsert({
      where: { slug: freelancer.slug },
      update: profileFields,
      create: {
        id: stableId("freelancer", freelancer.slug),
        userId,
        slug: freelancer.slug,
        ...profileFields,
      },
    });

    freelancerIdBySlug.set(freelancer.slug, row.id);

    // Replace rather than merge, so removing a skill from the data removes it
    // from the database on the next run.
    await prisma.skillOnFreelancer.deleteMany({
      where: { freelancerId: row.id },
    });
    await prisma.skillOnFreelancer.createMany({
      data: freelancer.skills.flatMap((skill) => {
        const skillId = skillIdBySlug.get(skill.slug);
        return skillId
          ? [{ freelancerId: row.id, skillId, yearsExp: skill.yearsExp }]
          : [];
      }),
      skipDuplicates: true,
    });

    await prisma.subscription.upsert({
      where: { userId },
      update: { plan: freelancer.isPro ? "FREELANCER_PRO" : "FREE" },
      create: {
        id: stableId("subscription", freelancer.email),
        userId,
        plan: freelancer.isPro ? "FREELANCER_PRO" : "FREE",
        status: "ACTIVE",
        priceRegion: freelancer.country,
      },
    });
  }

  console.log(`  freelancers: ${freelancerIdBySlug.size}`);

  // ── Jobs ─────────────────────────────────────────────────────────────────
  const jobIdBySlug = new Map<string, string>();

  for (const job of jobs) {
    const recruiterId = recruiterIdBySlug.get(job.recruiterSlug);
    const categoryId = categoryIdBySlug.get(job.categorySlug);

    if (!recruiterId || !categoryId) {
      throw new Error(
        `Job "${job.slug}" references a missing recruiter (${job.recruiterSlug}) or category (${job.categorySlug}).`,
      );
    }

    const publishedAt =
      job.publishedHoursAgo === null
        ? null
        : hoursAgo(now, job.publishedHoursAgo);

    const jobFields = {
      title: job.title,
      description: job.description,
      categoryId,
      engagementType: job.engagementType,
      budgetMinUsd: job.budgetMinUsd,
      budgetMaxUsd: job.budgetMaxUsd,
      isRemote: job.isRemote,
      location: job.isRemote ? null : job.location,
      status: job.status,
      publishedAt,
      closedAt: job.status === "CLOSED" ? daysAgo(now, 3) : null,
      // Denormalized from RecruiterProfile.tier so browse renders the required
      // tier badge without joining recruiters on every card.
      recruiterTier: recruiterTierBySlug.get(job.recruiterSlug) ?? "UNVERIFIED",
    };

    const row = await prisma.job.upsert({
      where: { slug: job.slug },
      update: jobFields,
      create: {
        id: stableId("job", job.slug),
        slug: job.slug,
        recruiterId,
        ...jobFields,
      },
    });

    jobIdBySlug.set(job.slug, row.id);

    await prisma.skillOnJob.deleteMany({ where: { jobId: row.id } });
    await prisma.skillOnJob.createMany({
      data: job.skillSlugs.flatMap((slug) => {
        const skillId = skillIdBySlug.get(slug);
        return skillId ? [{ jobId: row.id, skillId }] : [];
      }),
      skipDuplicates: true,
    });

    // Every PENDING_REVIEW job got there by tripping a filter, so give it a flag.
    if (job.status === "PENDING_REVIEW") {
      const { term, reason } = detectFlag(`${job.title}\n${job.description}`);
      await prisma.safetyFlag.upsert({
        where: { id: stableId("flag", job.slug) },
        update: { reason, matchedTerm: term, status: "OPEN" },
        create: {
          id: stableId("flag", job.slug),
          jobId: row.id,
          reason,
          matchedTerm: term,
          isAutomated: true,
          status: "OPEN",
        },
      });
    }
  }

  console.log(`  jobs: ${jobIdBySlug.size}`);

  // ── Applications ─────────────────────────────────────────────────────────
  let applicationCount = 0;

  for (const application of applications) {
    const jobId = jobIdBySlug.get(application.jobSlug);
    const freelancerId = freelancerIdBySlug.get(application.freelancerSlug);

    if (!jobId || !freelancerId) {
      throw new Error(
        `Application references a missing job (${application.jobSlug}) or freelancer (${application.freelancerSlug}).`,
      );
    }

    const createdAt = daysAgo(now, application.createdDaysAgo);
    const wasSeen = application.status !== "SUBMITTED";

    await prisma.application.upsert({
      where: { jobId_freelancerId: { jobId, freelancerId } },
      update: {
        coverLetter: application.coverLetter,
        proposedRateUsd: application.proposedRateUsd,
        status: application.status,
        viewedAt: wasSeen ? createdAt : null,
        createdAt,
      },
      create: {
        id: stableId(
          "application",
          `${application.jobSlug}:${application.freelancerSlug}`,
        ),
        jobId,
        freelancerId,
        coverLetter: application.coverLetter,
        proposedRateUsd: application.proposedRateUsd,
        status: application.status,
        viewedAt: wasSeen ? createdAt : null,
        createdAt,
      },
    });
    applicationCount += 1;
  }

  console.log(`  applications: ${applicationCount}`);

  // ── Engagements and reviews ──────────────────────────────────────────────
  let reviewCount = 0;

  for (const engagement of engagements) {
    const freelancerId = freelancerIdBySlug.get(engagement.freelancerSlug);
    const recruiterId = recruiterIdBySlug.get(engagement.recruiterSlug);

    if (!freelancerId || !recruiterId) {
      throw new Error(
        `Engagement "${engagement.key}" references a missing freelancer (${engagement.freelancerSlug}) or recruiter (${engagement.recruiterSlug}).`,
      );
    }

    const jobId = engagement.jobSlug
      ? (jobIdBySlug.get(engagement.jobSlug) ?? null)
      : null;
    const engagementId = stableId("engagement", engagement.key);

    // isConfirmed and confirmedAt are derived by a database trigger from these
    // two booleans, so they are deliberately not set here.
    const engagementFields = {
      jobId,
      statedRateUsd: engagement.statedRateUsd,
      durationWeeks: engagement.durationWeeks,
      freelancerConfirmed: engagement.freelancerConfirmed,
      recruiterConfirmed: engagement.recruiterConfirmed,
    };

    await prisma.engagement.upsert({
      where: { id: engagementId },
      update: engagementFields,
      create: {
        id: engagementId,
        freelancerId,
        recruiterId,
        ...engagementFields,
      },
    });

    const isConfirmed =
      engagement.freelancerConfirmed && engagement.recruiterConfirmed;

    if (!isConfirmed) {
      if (engagement.reviews.length > 0) {
        throw new Error(
          `Engagement "${engagement.key}" is not mutually confirmed but carries reviews. The database would reject these.`,
        );
      }
      continue;
    }

    for (const review of engagement.reviews) {
      const byFreelancer = review.authorSide === "FREELANCER";

      await prisma.review.upsert({
        where: {
          id: stableId("review", `${engagement.key}:${review.authorSide}`),
        },
        update: { rating: review.rating, body: review.body },
        create: {
          id: stableId("review", `${engagement.key}:${review.authorSide}`),
          engagementId,
          // Half of the composite foreign key into Engagement(id, isConfirmed).
          // A review against an unconfirmed engagement has no FK target.
          engagementIsConfirmed: true,
          // A freelancer reviews the recruiter; a recruiter reviews the
          // freelancer. Enforced by a CHECK constraint.
          authorFreelancerId: byFreelancer ? freelancerId : null,
          authorRecruiterId: byFreelancer ? null : recruiterId,
          subjectFreelancerId: byFreelancer ? null : freelancerId,
          subjectRecruiterId: byFreelancer ? recruiterId : null,
          rating: review.rating,
          body: review.body,
        },
      });
      reviewCount += 1;
    }
  }

  console.log(
    `  engagements: ${engagements.length}   reviews: ${reviewCount}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\nSeed complete.");
  })
  .catch(async (error: unknown) => {
    console.error("\nSeed failed:");
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
