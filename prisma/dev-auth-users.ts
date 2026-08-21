import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { prisma } from "../lib/db/client";

/**
 * Gives every seeded account a Supabase Auth login, so the signed-in product
 * can actually be opened locally.
 *
 * The seed creates Prisma User rows with deterministic ids but no Auth users,
 * which means none of the seeded recruiters, freelancers or admins could sign
 * in — the entire dashboard, engagements and moderation surface was
 * unreachable in development. This creates the matching Auth user with the
 * SAME id, so the existing Prisma rows link up untouched.
 *
 * DEVELOPMENT ONLY. It sets one shared password on every account and refuses
 * to run against anything that looks like production.
 *
 *   npx tsx prisma/dev-auth-users.ts
 */

const PASSWORD = process.env.DEV_SEED_PASSWORD ?? "Talent4u-dev-2026";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to run: this sets a shared password on every account.");
  }

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true },
    orderBy: { email: "asc" },
  });
  console.log(`${users.length} seeded accounts\n`);

  let created = 0;
  let existing = 0;
  let failed = 0;

  for (const user of users) {
    const { error } = await admin.auth.admin.createUser({
      // Same id as the Prisma row, so nothing has to be relinked afterwards.
      id: user.id,
      email: user.email,
      password: PASSWORD,
      // No inbox to confirm from in development.
      email_confirm: true,
    });

    if (!error) {
      created += 1;
      continue;
    }
    // Already present from a previous run — reset the password so a partially
    // seeded database still ends up fully usable.
    if (/already|exists|registered/i.test(error.message)) {
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        password: PASSWORD,
        email_confirm: true,
      });
      if (updateError) {
        failed += 1;
        console.log(`FAIL  ${user.email} — ${updateError.message}`);
      } else {
        existing += 1;
      }
      continue;
    }
    failed += 1;
    console.log(`FAIL  ${user.email} — ${error.message}`);
  }

  // Mirror Supabase's confirmation into the app row, which the verification
  // rules read ("requires a confirmed account email").
  const verified = await prisma.user.updateMany({
    where: { emailVerified: null },
    data: { emailVerified: new Date() },
  });

  const byRole = new Map<string, string>();
  for (const u of users) if (!byRole.has(u.role)) byRole.set(u.role, u.email);

  console.log(`\n${created} created, ${existing} updated, ${failed} failed`);
  console.log(`${verified.count} app rows marked email-verified\n`);
  console.log(`Password for every account: ${PASSWORD}\n`);
  console.log("Sign in at http://localhost:3000/signin as:");
  for (const [role, email] of byRole) console.log(`  ${role.padEnd(11)} ${email}`);

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
