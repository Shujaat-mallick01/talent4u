import { prisma } from "../lib/db/client";
import {
  applySubscriptionState,
  findUserIdByStripeCustomer,
  getBillingState,
  linkStripeCustomer,
  setBillingCountryFromStripe,
  userExists,
} from "../lib/db/subscription";
import { bandForCountry } from "../lib/pricing/bands";
import { formatMonthly, priceFor } from "../lib/pricing/prices";
import { purchasablePlans } from "../lib/billing/subscription-state";

/**
 * Live checks for subscription billing against the real database.
 *
 * The unit tests prove the rules; this proves the storage behaves the way the
 * rules assume — specifically the webhook ordering guard, which is a claim
 * about Postgres and cannot be tested with a mock.
 *
 * lib/services/billing.ts is deliberately NOT imported: it pulls in the Stripe
 * client, which carries `import "server-only"` so a secret key can never be
 * bundled for a browser. That guard is worth more than the convenience, so the
 * view it builds is verified by rendering the real page instead.
 *
 * Everything it writes, it puts back.
 */

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

async function main() {
  const freelancer = await prisma.user.findFirst({
    where: { role: "FREELANCER", subscription: null },
    select: { id: true, billingCountry: true },
  });
  const recruiter = await prisma.user.findFirst({
    where: { role: "RECRUITER" },
    select: { id: true },
  });
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!freelancer || !recruiter || !admin) throw new Error("seed is missing a role");

  const originalCountry = freelancer.billingCountry;
  const CUSTOMER = "cus_verify_t4u";
  const SUB = "sub_verify_t4u";

  // ── Reads ───────────────────────────────────────────────────────────────
  const state = await getBillingState(freelancer.id);
  check("billing state loads for a real account", state?.userId, freelancer.id);
  check("billing state is null for a nonsense id", await getBillingState("not-an-id"), null);
  check("userExists is true for a seeded account", await userExists(freelancer.id), true);
  check(
    "userExists is false for an id that names nobody",
    await userExists("00000000-0000-4000-8000-00000000dead"),
    false,
  );

  // ── Customer linking ────────────────────────────────────────────────────
  await linkStripeCustomer(freelancer.id, CUSTOMER);
  check("customer resolves back to the account", await findUserIdByStripeCustomer(CUSTOMER), freelancer.id);
  check(
    "an unknown customer resolves to nobody",
    await findUserIdByStripeCustomer("cus_does_not_exist"),
    null,
  );
  const afterLink = await getBillingState(freelancer.id);
  check("linking a customer does NOT grant a plan", afterLink?.subscription?.plan, "FREE");

  // ── The ordering guard ──────────────────────────────────────────────────
  const t1 = new Date("2026-08-01T00:00:00Z");
  const t2 = new Date("2026-08-02T00:00:00Z");
  const periodEnd = new Date("2026-09-01T00:00:00Z");

  const apply = (eventAt: Date, plan: "FREELANCER_PRO" | "FREE", status: "ACTIVE" | "CANCELED") =>
    applySubscriptionState({
      userId: freelancer.id,
      stripeCustomerId: CUSTOMER,
      stripeSubscriptionId: SUB,
      plan,
      status,
      currentPeriodEnd: status === "ACTIVE" ? periodEnd : null,
      cancelAtPeriodEnd: false,
      priceRegion: "LOW",
      eventAt,
    });

  check("a first event applies", await apply(t2, "FREELANCER_PRO", "ACTIVE"), "applied");
  check("plan is live after it", (await getBillingState(freelancer.id))?.subscription?.plan, "FREELANCER_PRO");

  // The event that would resurrect a cancelled plan if ordering were ignored.
  check("an OLDER event is dropped", await apply(t1, "FREE", "CANCELED"), "stale");
  check(
    "the newer state survived the older event",
    (await getBillingState(freelancer.id))?.subscription?.plan,
    "FREELANCER_PRO",
  );

  check("the same event re-applied is idempotent", await apply(t2, "FREELANCER_PRO", "ACTIVE"), "applied");
  check(
    "re-applying changed nothing",
    (await getBillingState(freelancer.id))?.subscription?.status,
    "ACTIVE",
  );

  const t3 = new Date("2026-08-03T00:00:00Z");
  check("a newer cancellation applies", await apply(t3, "FREE", "CANCELED"), "applied");
  check(
    "the plan is gone after it",
    (await getBillingState(freelancer.id))?.subscription?.plan,
    "FREE",
  );

  // ── One subscription, one account ───────────────────────────────────────
  const stolen = await applySubscriptionState({
    userId: recruiter.id,
    stripeCustomerId: "cus_someone_else",
    stripeSubscriptionId: SUB,
    plan: "RECRUITER_GROWTH",
    status: "ACTIVE",
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    priceRegion: "STANDARD",
    eventAt: new Date("2026-08-04T00:00:00Z"),
  });
  check("another account cannot take over a subscription", stolen, "conflict");

  // ── The pricing the view will read ──────────────────────────────────────
  await setBillingCountryFromStripe(freelancer.id, "pk");
  const stored = await getBillingState(freelancer.id);
  check("country is normalised to upper case", stored?.billingCountry, "PK");
  check("PK resolves to the LOW band", bandForCountry(stored?.billingCountry), "LOW");
  check(
    "Pro is priced at the PK band",
    formatMonthly(priceFor("FREELANCER_PRO", bandForCountry(stored?.billingCountry))),
    "$3/mo",
  );
  check("the list price is $6/mo", formatMonthly(priceFor("FREELANCER_PRO", "STANDARD")), "$6/mo");
  check(
    "a cancelled subscription leaves no live plan",
    stored?.subscription?.status,
    "CANCELED",
  );
  check("only the freelancer plan is offered", purchasablePlans("FREELANCER"), ["FREELANCER_PRO"]);
  check("a recruiter is offered both recruiter plans", purchasablePlans("RECRUITER"), [
    "RECRUITER_GROWTH",
    "RECRUITER_TEAM",
  ]);
  check("an admin is offered nothing", purchasablePlans("ADMIN"), []);

  // ── Cleanup ─────────────────────────────────────────────────────────────
  await prisma.subscription.deleteMany({ where: { userId: freelancer.id } });
  await prisma.user.update({
    where: { id: freelancer.id },
    data: { billingCountry: originalCountry },
  });
  const cleaned = await getBillingState(freelancer.id);
  check("test subscription removed", cleaned?.subscription, null);
  check("billing country restored", cleaned?.billingCountry, originalCountry);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
