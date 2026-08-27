import { prisma } from "./client";

/**
 * The three numbers that say whether the marketplace works.
 *
 * BUILD_PLAN names them and then says the important part: "Ignore vanity
 * metrics — do not build a signups counter." Signups measure marketing.
 * These measure whether the two sides of the market actually meet:
 *
 *   1. Do posted jobs attract applicants?
 *   2. Do companies come back after their first hire attempt?
 *   3. Do applicants hear anything back?
 *
 * Every one is a RATIO with an honest denominator, and the denominator is
 * where these usually go wrong. A job posted an hour ago has not failed to get
 * five applications in 48 hours — it has not had 48 hours. So each measure
 * counts only the population that has had time to succeed, which is why all
 * three are raw SQL: the window is per-row and relative to that row's own
 * start, which Prisma cannot express.
 *
 * `::int` on every count because Postgres returns bigint, and Prisma maps that
 * to a JS BigInt that JSON.stringify then refuses to serialize.
 */

export type Ratio = {
  /** Rows that met the bar. */
  hit: number;
  /** Rows that had a fair chance to. */
  total: number;
};

type RatioRow = { hit: number; total: number };

const first = (rows: RatioRow[]): Ratio => rows[0] ?? { hit: 0, total: 0 };

/**
 * Jobs that drew 5+ applications within 48 hours of publication.
 *
 * Denominator: every job ever published more than 48 hours ago — including
 * ones since closed or removed, because they still had their 48 hours. A job
 * published an hour ago is excluded rather than counted as a failure.
 */
export async function jobsWithEarlyTraction(): Promise<Ratio> {
  const rows = await prisma.$queryRaw<RatioRow[]>`
    SELECT
      count(*) FILTER (WHERE scored.applications >= 5)::int AS "hit",
      count(*)::int                                        AS "total"
    FROM (
      SELECT
        j."id",
        (
          SELECT count(*)
          FROM "Application" a
          WHERE a."jobId" = j."id"
            AND a."createdAt" <= j."publishedAt" + interval '48 hours'
        ) AS applications
      FROM "Job" j
      WHERE j."publishedAt" IS NOT NULL
        AND j."publishedAt" <= now() - interval '48 hours'
    ) AS scored
  `;
  return first(rows);
}

/**
 * Companies that published a second role within 60 days of their first.
 *
 * The retention number, and the one that decides whether this is a business.
 * Denominator: companies whose FIRST post is at least 60 days old — anyone who
 * joined last week has not declined to come back, they simply have not had the
 * window yet.
 */
export async function recruitersWhoPostedAgain(): Promise<Ratio> {
  const rows = await prisma.$queryRaw<RatioRow[]>`
    WITH firsts AS (
      SELECT j."recruiterId" AS recruiter_id, min(j."publishedAt") AS first_at
      FROM "Job" j
      WHERE j."publishedAt" IS NOT NULL
      GROUP BY j."recruiterId"
    )
    SELECT
      count(*) FILTER (WHERE EXISTS (
        SELECT 1
        FROM "Job" j2
        WHERE j2."recruiterId" = f.recruiter_id
          AND j2."publishedAt" >  f.first_at
          AND j2."publishedAt" <= f.first_at + interval '60 days'
      ))::int AS "hit",
      count(*)::int AS "total"
    FROM firsts f
    WHERE f.first_at <= now() - interval '60 days'
  `;
  return first(rows);
}

/**
 * Freelancers who heard something back within 30 days of their first
 * application.
 *
 * "Heard back" is deliberately narrow: a decision (SHORTLISTED or REJECTED) or
 * a message from somebody else. VIEWED does NOT count — it is set
 * automatically when a recruiter opens their inbox, so counting it would let
 * the number rise without a single human replying to anyone, which is exactly
 * the self-deception this dashboard exists to avoid.
 *
 * A rejection counts. It is not a good outcome, but it IS an answer, and a
 * marketplace where people are ignored is a different failure from one where
 * they are turned down.
 *
 * KNOWN APPROXIMATION: the decision's timestamp is Application.updatedAt,
 * which is "the row last changed" and not "the decision was made" — a private
 * note written months later moves it. There is no decidedAt column to use
 * instead. The bias is one-directional and it is the safe direction: a late
 * edit pushes the decision OUTSIDE the 30-day window, so this measure
 * understates how often people hear back. Never the reverse. If it ever
 * matters enough to be exact, the fix is a decidedAt column written by
 * setApplicationStatusForUser, not a cleverer query.
 */
export async function freelancersWhoHeardBack(): Promise<Ratio> {
  const rows = await prisma.$queryRaw<RatioRow[]>`
    WITH firsts AS (
      SELECT
        a."freelancerId" AS freelancer_id,
        fp."userId"      AS user_id,
        min(a."createdAt") AS first_at
      FROM "Application" a
      JOIN "FreelancerProfile" fp ON fp."id" = a."freelancerId"
      GROUP BY a."freelancerId", fp."userId"
    )
    SELECT
      count(*) FILTER (WHERE
        EXISTS (
          SELECT 1
          FROM "Application" a2
          WHERE a2."freelancerId" = f.freelancer_id
            AND a2."status" IN ('SHORTLISTED', 'REJECTED')
            AND a2."updatedAt" <= f.first_at + interval '30 days'
        )
        OR EXISTS (
          SELECT 1
          FROM "Message" m
          JOIN "ConversationParticipant" cp ON cp."conversationId" = m."conversationId"
          WHERE cp."userId"   = f.user_id
            AND m."senderId" <> f.user_id
            AND m."createdAt" <= f.first_at + interval '30 days'
        )
      )::int AS "hit",
      count(*)::int AS "total"
    FROM firsts f
    WHERE f.first_at <= now() - interval '30 days'
  `;
  return first(rows);
}

/**
 * Context for the three ratios: what is actually on the platform right now.
 *
 * Not a scoreboard — these are denominators a reader needs to know how much
 * weight to put on a percentage. "60% of jobs" means something different over
 * 5 jobs than over 500, and a dashboard that hides that invites the reader to
 * over-read it.
 */
export async function marketplaceScale(): Promise<{
  publishedJobs: number;
  applications: number;
  companiesWhoPosted: number;
  freelancersWhoApplied: number;
}> {
  const [publishedJobs, applications, companies, freelancers] = await Promise.all([
    prisma.job.count({ where: { publishedAt: { not: null } } }),
    prisma.application.count(),
    prisma.job
      .findMany({ where: { publishedAt: { not: null } }, distinct: ["recruiterId"], select: { recruiterId: true } })
      .then((r) => r.length),
    prisma.application
      .findMany({ distinct: ["freelancerId"], select: { freelancerId: true } })
      .then((r) => r.length),
  ]);

  return {
    publishedJobs,
    applications,
    companiesWhoPosted: companies,
    freelancersWhoApplied: freelancers,
  };
}
