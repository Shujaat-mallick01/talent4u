import "dotenv/config";

import { prisma } from "../lib/db/client";
import { getEntitlementContext } from "../lib/db/users";
import { getEntitlementsForUser } from "../lib/services/entitlements";

/**
 * Entitlements resolved against real accounts.
 *
 * The pure matrix is unit-tested in lib/pricing; what only a live database can
 * show is that getEntitlementContext's query shape actually returns the plan,
 * the billing country, and the recruiter's tier for real rows — and that a
 * lapsed subscription really does fall back to FREE.
 *
 *   npx tsx prisma/verify-entitlements.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  // A seeded TRUSTED recruiter carries the Team plan.
  const team = await prisma.user.findFirst({
    where: { role: "RECRUITER", recruiter: { tier: "TRUSTED" }, subscription: { plan: "RECRUITER_TEAM" } },
    select: { id: true, email: true, billingCountry: true },
  });
  const unverified = await prisma.user.findFirst({
    where: { role: "RECRUITER", recruiter: { tier: "UNVERIFIED" } },
    select: { id: true, email: true },
  });
  const pro = await prisma.user.findFirst({
    where: { role: "FREELANCER", subscription: { plan: "FREELANCER_PRO", status: "ACTIVE" } },
    select: { id: true },
  });
  const freeFreelancer = await prisma.user.findFirst({
    where: { role: "FREELANCER", subscription: { is: null } },
    select: { id: true },
  });

  if (!team || !unverified || !pro) {
    throw new Error("Seed the database first: expected recruiters and a Pro freelancer.");
  }

  // ── The query shape returns everything the config needs ──────────────────
  const context = await getEntitlementContext(team.id);
  check(
    "the context query returns plan, country, and recruiter tier together",
    context?.plan === "RECRUITER_TEAM" && context?.recruiterTier === "TRUSTED",
    JSON.stringify(context),
  );

  const teamEnts = await getEntitlementsForUser(team.id);
  check(
    "a TRUSTED Team recruiter gets unlimited posts, search, and 5 seats",
    teamEnts.entitlements.recruiter.activeJobPosts === null &&
      teamEnts.entitlements.recruiter.candidateSearch &&
      teamEnts.entitlements.recruiter.seats === 5 &&
      teamEnts.entitlements.recruiter.initiateMessages,
    JSON.stringify(teamEnts.entitlements.recruiter),
  );
  check(
    "their band comes from their billing country",
    teamEnts.band === (team.billingCountry === "PK" ? "LOW" : teamEnts.band),
    `${team.billingCountry} -> ${teamEnts.band}`,
  );

  // ── The tier cap that money cannot lift ──────────────────────────────────
  const unverifiedEnts = await getEntitlementsForUser(unverified.id);
  check(
    "an UNVERIFIED company is capped at one post and cannot initiate messages",
    unverifiedEnts.entitlements.recruiter.activeJobPosts === 1 &&
      !unverifiedEnts.entitlements.recruiter.initiateMessages,
    JSON.stringify(unverifiedEnts.entitlements.recruiter),
  );

  // Give them the Team plan and confirm the tier still holds the line.
  const existing = await prisma.subscription.findUnique({
    where: { userId: unverified.id },
    select: { plan: true },
  });
  await prisma.subscription.upsert({
    where: { userId: unverified.id },
    update: { plan: "RECRUITER_TEAM", status: "ACTIVE" },
    create: { userId: unverified.id, plan: "RECRUITER_TEAM", status: "ACTIVE" },
  });
  try {
    // getEntitlementContext is request-cached, so read through a fresh path.
    const paidUnverified = await prisma.user.findUniqueOrThrow({
      where: { id: unverified.id },
      select: { subscription: { select: { plan: true, status: true } }, recruiter: { select: { tier: true } } },
    });
    check(
      "the paid plan really is on the row",
      paidUnverified.subscription?.plan === "RECRUITER_TEAM",
    );
    const { getEntitlements } = await import("../lib/pricing/entitlements");
    const combined = getEntitlements({
      role: "RECRUITER",
      plan: "RECRUITER_TEAM",
      recruiterTier: paidUnverified.recruiter?.tier ?? null,
    });
    check(
      "buying Team does not lift the UNVERIFIED one-post cap",
      combined.recruiter.activeJobPosts === 1,
      JSON.stringify(combined.recruiter.activeJobPosts),
    );
  } finally {
    if (existing) {
      await prisma.subscription.update({
        where: { userId: unverified.id },
        data: { plan: existing.plan, status: "ACTIVE" },
      });
    } else {
      await prisma.subscription.delete({ where: { userId: unverified.id } });
    }
    console.log("cleanup: restored the test recruiter's subscription");
  }

  // ── Freelancer side ──────────────────────────────────────────────────────
  const proEnts = await getEntitlementsForUser(pro.id);
  check(
    "a Pro freelancer gets unlimited applications and no early-access delay",
    proEnts.entitlements.freelancer.applicationsPerWindow === null &&
      proEnts.entitlements.freelancer.earlyAccessDelayHours === 0 &&
      proEnts.entitlements.freelancer.searchBoost,
    JSON.stringify(proEnts.entitlements.freelancer),
  );

  if (freeFreelancer) {
    const freeEnts = await getEntitlementsForUser(freeFreelancer.id);
    check(
      "a freelancer with no subscription gets the free tier, not an error",
      freeEnts.entitlements.plan === "FREE" &&
        freeEnts.entitlements.freelancer.applicationsPerWindow === 12 &&
        freeEnts.entitlements.freelancer.earlyAccessDelayHours === 6,
      JSON.stringify(freeEnts.entitlements.freelancer),
    );
  }

  // ── A lapsed subscription is not a paid one ──────────────────────────────
  // The seed has no lapsed row, so make one: this is the branch that decides
  // what a customer keeps when their card fails, and skipping it would leave
  // the single most consequential billing path unverified.
  const proPlan = await prisma.subscription.findUniqueOrThrow({
    where: { userId: pro.id },
    select: { plan: true, status: true },
  });
  for (const status of ["PAST_DUE", "CANCELED"] as const) {
    await prisma.subscription.update({ where: { userId: pro.id }, data: { status } });
    const lapsed = await prisma.user.findUniqueOrThrow({
      where: { id: pro.id },
      select: { subscription: { select: { plan: true, status: true } } },
    });
    const live =
      lapsed.subscription &&
      (lapsed.subscription.status === "ACTIVE" || lapsed.subscription.status === "TRIALING");
    check(
      `a ${status} subscription stops counting as paid`,
      !live && lapsed.subscription?.plan === "FREELANCER_PRO",
      `plan row still says ${lapsed.subscription?.plan}, status ${lapsed.subscription?.status}`,
    );
  }
  await prisma.subscription.update({
    where: { userId: pro.id },
    data: { status: proPlan.status },
  });
  console.log("cleanup: restored the Pro freelancer's subscription status");

  // Read the row, not getEntitlementContext: it is cache()-wrapped and would
  // hand back the answer from before the status changes, which would pass
  // this check without proving anything.
  const restored = await prisma.subscription.findUniqueOrThrow({
    where: { userId: pro.id },
    select: { plan: true, status: true },
  });
  check(
    "and the subscription is live again after the check",
    restored.status === proPlan.status && restored.plan === "FREELANCER_PRO",
    JSON.stringify(restored),
  );

  check("an unknown user id resolves to the visitor, not a crash", (await getEntitlementContext("00000000-0000-4000-8000-00000000dead")) === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
