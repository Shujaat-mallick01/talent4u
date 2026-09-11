import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Two projects, because the existing suite and the one the product actually
 * needs have opposite requirements.
 *
 *   unit         Pure logic and services with lib/db mocked at the module
 *                boundary. No database, no network. Fast, and the only kind
 *                of test that existed before this.
 *
 *   integration  Real Postgres. For the rules that are enforced IN SQL and
 *                therefore cannot be proven anywhere else: the row locks
 *                behind the application quota and the post cap, the CHECK
 *                constraints and trigger behind the review lock, and the
 *                RLS lockdown.
 *
 * The split is not bureaucracy. `lib/services/report.test.ts` used to import a
 * Server Action that called the real rate limiter against the real database
 * while believing it was mocked — it passed for months only because the
 * limiter fails open, then went red when the database came back and the
 * counter crossed its hourly limit. A suite that can do real IO by accident
 * cannot tell you which kind of test you wrote. Now `unit` has no database
 * URL it is willing to use, and `integration` refuses to run against anything
 * that is not a declared test database.
 */

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    projects: [
      {
        resolve: { alias: { "@": root } },
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts", "app/**/*.test.ts", "tests/*.test.ts"],
          exclude: ["tests/integration/**"],
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        resolve: { alias: { "@": root } },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup.ts", "tests/integration/setup.ts"],
          // These share one database. Running files in parallel would let one
          // file's truncation delete another's fixtures mid-assertion.
          fileParallelism: false,
          // Real round trips, and some tests deliberately run queries in
          // parallel to prove a lock holds.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
