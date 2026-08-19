import "dotenv/config";

import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 has no `datasource.directUrl` — the type is `{ url, shadowDatabaseUrl }`.
 * The pooled/direct split is expressed differently in v7, and ends up cleaner:
 *
 *   - This file configures the CLI only (migrate, studio, introspect). It gets
 *     DIRECT_URL, the direct Supabase connection on port 5432. Migrations must
 *     not run through pgBouncer: DDL and the migration advisory lock both fail
 *     against a transaction pooler.
 *
 *   - The application runtime never reads this file. It connects through the
 *     driver adapter in lib/db/client.ts, which gets DATABASE_URL, the pooled
 *     connection on port 6543, so serverless functions cannot exhaust the
 *     direct connection limit.
 *
 * Two connection strings, two consumers, no overlap.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Prisma 7 reads the seed command from here. The `prisma.seed` key in
    // package.json is no longer honoured.
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
    // Supabase does not let the pooler create the throwaway database that
    // `prisma migrate dev` needs. Point this at a second database (a local
    // Postgres is fine) if you want to use `migrate dev`; otherwise use
    // `prisma migrate deploy`, which needs no shadow database.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
