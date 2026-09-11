import { afterAll, beforeAll } from "vitest";

import { prisma } from "@/lib/db/client";

/**
 * The guard, and the reason it is the first thing in this file.
 *
 * Integration tests truncate tables. Pointed at the wrong database that is not
 * a failing test, it is data loss — and `.env` in this repo points at the real
 * Supabase project, which is exactly what a developer will have loaded when
 * they type `npm run test:int` for the first time.
 *
 * So: refuse unless the connection string names a database that has opted in by
 * calling itself a test database. Fail loudly, never silently skip — a guard
 * that quietly passes teaches people the suite is green when it never ran.
 */
const url = process.env.DATABASE_URL ?? "";

const looksLikeTestDatabase =
  /(^|[/_-])talent4u_test($|[?/])/.test(url) ||
  /(^|[/_-])test($|[?/])/.test(url) ||
  process.env.INTEGRATION_DB_OK === "i-know-this-is-a-test-database";

if (!looksLikeTestDatabase) {
  throw new Error(
    [
      "",
      "Integration tests refuse to run against this DATABASE_URL.",
      "",
      "They TRUNCATE tables. The database must name itself a test database —",
      "  postgresql://.../talent4u_test",
      "or you must set INTEGRATION_DB_OK=i-know-this-is-a-test-database.",
      "",
      "Never point these at the Supabase project in .env.",
      "",
    ].join("\n"),
  );
}

/**
 * Isolation by TRUNCATE between files, not by rolled-back transactions.
 *
 * The trade-off, stated because BUILD_PLAN 0.3 asks for it:
 *
 *   Rolled-back transactions are faster and need no cleanup, but every query in
 *   a test has to run on the same connection, inside that outer transaction.
 *   This codebase's most important behaviour is `prisma.$transaction` with
 *   `SELECT ... FOR UPDATE` inside it — nested under an outer transaction, a
 *   row lock no longer means what it means in production, and a concurrency
 *   test would prove nothing. Two "concurrent" queries on one connection are
 *   not concurrent at all.
 *
 *   TRUNCATE is slower and needs ordering care, but each test talks to the
 *   database exactly as the application does: real connections from the pool,
 *   real transactions, real locks. For a suite whose whole purpose is proving
 *   locks hold, that is the only option that means anything.
 *
 * CASCADE handles the foreign keys, so the order of the list does not matter.
 */
const TABLES = [
  "Application",
  "Conversation",
  "ConversationParticipant",
  "Engagement",
  "FreelancerProfile",
  "Job",
  "Message",
  "RateLimit",
  "RecruiterProfile",
  "Report",
  "Review",
  "SafetyFlag",
  "SavedJob",
  "SkillOnFreelancer",
  "SkillOnJob",
  "Subscription",
  "User",
  // Category and Skill are taxonomy: reference data the factories rely on, so
  // they are seeded once per file rather than truncated between them.
] as const;

export async function truncateAll(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
