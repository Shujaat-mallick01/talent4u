import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 requires an explicit driver adapter for SQL providers.
//
// DATABASE_URL is Supabase's POOLED connection (pgBouncer, port 6543). Migrations
// use DIRECT_URL instead — see prisma.config.ts. Do not point this at the direct
// connection: serverless functions will exhaust it.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy the Supabase transaction-pooler connection string (port 6543) into .env.",
  );
}

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// Next.js dev server hot-reloads modules, which would otherwise open a new pool
// on every reload until the database refuses connections.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
