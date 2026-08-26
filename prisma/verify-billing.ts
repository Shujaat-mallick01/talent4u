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
import type { PlanTier, SubscriptionStatus } from "../lib/generated/prisma/enums";

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

  // ── A replaced subscription cannot cancel the one that replaced it ──────
  //
  // The upgrade path. Stripe does not mutate a subscription when the plan
  // changes through a new checkout — it creates a second one and ends the
  // first, and the ending arrives LAST. Applying it on timestamp alone would
  // cancel the plan the customer had just paid for.
  const SUB_B = `${SUB}_upgrade`;
  const on = (
    stripeSubscriptionId: string,
    eventAt: Date,
    plan: PlanTier,
    status: SubscriptionStatus,
  ) =>
    applySubscriptionState({
      userId: freelancer.id,
      stripeCustomerId: CUSTOMER,
      stripeSubscriptionId,
      plan,
      status,
      currentPeriodEnd: status === "ACTIVE" ? periodEnd : null,
      cancelAtPeriodEnd: false,
      priceRegion: "LOW",
      eventAt,
    });
  const day = (n: number) => new Date(`2026-08-${String(n).padStart(2, "0")}T00:00:00Z`);
  const tracked = async () =>
    (await getBillingState(freelancer.id))?.subscription?.stripeSubscriptionId;
  const planNow = async () => (await getBillingState(freelancer.id))?.subscription?.plan;
  const statusNow = async () => (await getBillingState(freelancer.id))?.subscription?.status;

  check("back on the original subscription", await on(SUB, day(5), "FREELANCER_PRO", "ACTIVE"), "applied");
  check("a LIVE subscription may take the row over", await on(SUB_B, day(6), "FREELANCER_PRO", "ACTIVE"), "applied");
  check("the row now tracks the new subscription", await tracked(), SUB_B);

  check(
    "a later delete for the REPLACED subscription is refused",
    await on(SUB, day(7), "FREE", "CANCELED"),
    "superseded",
  );
  check("the plan the customer pays for survived it", await planNow(), "FREELANCER_PRO");
  check("and the row still tracks the new subscription", await tracked(), SUB_B);

  check(
    "a later past_due for the REPLACED subscription is refused too",
    await on(SUB, day(8), "FREELANCER_PRO", "PAST_DUE"),
    "superseded",
  );
  check("the live plan is untouched", await statusNow(), "ACTIVE");

  check(
    "but the TRACKED subscription may absolutely lapse",
    await on(SUB_B, day(9), "FREELANCER_PRO", "PAST_DUE"),
    "applied",
  );
  check("and it does", await statusNow(), "PAST_DUE");

  // ── The upgrade, delivered in the WRONG order ───────────────────────────
  //
  // The order above is the lucky one. Stripe does not promise it, and the
  // unlucky one is the expensive direction: the OLD subscription's delete
  // carries a LATER `created` than the NEW subscription's create (it is
  // cancelled after the replacement exists), so if it is delivered first, a
  // per-account watermark parks itself ahead of every event belonging to the
  // subscription the customer is now being charged for.
  await prisma.subscription.deleteMany({ where: { userId: freelancer.id } });
  await linkStripeCustomer(freelancer.id, CUSTOMER);

  check("on the first subscription", await on(SUB, day(10), "FREELANCER_PRO", "ACTIVE"), "applied");
  // The delete for SUB arrives FIRST, stamped later than SUB_B's create.
  check(
    "the replaced subscription's delete lands first",
    await on(SUB, day(13), "FREE", "CANCELED"),
    "applied",
  );
  check("which does drop the plan for a moment", await planNow(), "FREE");

  // ...and now the event that was actually current turns up, stamped EARLIER.
  check(
    "the replacement's create still applies despite the older timestamp",
    await on(SUB_B, day(12), "FREELANCER_PRO", "ACTIVE"),
    "applied",
  );
  check("the customer has the plan they are paying for", await planNow(), "FREELANCER_PRO");
  check("and the row tracks the live subscription", await tracked(), SUB_B);

  // The bound on that leniency: a genuinely ancient event cannot resurrect a
  // subscription that ended long ago. Stripe stops retrying after three days.
  check(
    "an ancient redelivery for a long-dead subscription is refused",
    await on(SUB, day(1), "FREELANCER_PRO", "ACTIVE"),
    "stale",
  );
  check("the live subscription is untouched", await tracked(), SUB_B);

  // ── Same-second ties ────────────────────────────────────────────────────
  //
  // `created` has one-second resolution, and `customer.subscription.created`
  // (incomplete) and `customer.subscription.updated` (active) routinely share
  // one. Whichever arrives second must not be able to take the plan away.
  const tie = new Date("2026-08-15T09:00:00Z");
  check("an active state at the tie applies", await on(SUB_B, tie, "FREELANCER_PRO", "ACTIVE"), "applied");
  check(
    "a lapse sharing the same second does NOT overwrite it",
    await on(SUB_B, tie, "FREELANCER_PRO", "PAST_DUE"),
    "stale",
  );
  check("the paying customer keeps the plan", await statusNow(), "ACTIVE");
  check(
    "but a strictly newer lapse does apply",
    await on(SUB_B, new Date(tie.getTime() + 1000), "FREELANCER_PRO", "PAST_DUE"),
    "applied",
  );
  check("and it lands", await statusNow(), "PAST_DUE");

  // ── Concurrent deliveries ───────────────────────────────────────────────
  //
  // Stripe delivers in parallel, and this guard used to be a read followed by
  // a write. At READ COMMITTED that lets two deliveries both read "nothing
  // newer" and both write, so the OLDER one can land second and win. It is now
  // one conditional UPDATE, which re-evaluates its own WHERE against the row
  // it locks. Fire bursts newest-first — the order that breaks the naive
  // version — and require the newest state to survive every time.
  const BURST = 12;
  const ROUNDS = 5;
  let raced = 0;
  for (let round = 0; round < ROUNDS; round++) {
    await prisma.subscription.deleteMany({ where: { userId: freelancer.id } });
    const t0 = new Date(`2026-09-0${round + 1}T00:00:00Z`).getTime();
    const results = await Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        // i = 0 is the newest event and the only live one.
        on(
          SUB,
          new Date(t0 + (BURST - i) * 60_000),
          i === 0 ? "FREELANCER_PRO" : "FREE",
          i === 0 ? "ACTIVE" : "CANCELED",
        ),
      ),
    );
    const row = await prisma.subscription.findUnique({
      where: { userId: freelancer.id },
      select: { plan: true, status: true, lastStripeEventAt: true },
    });
    const newest = new Date(t0 + BURST * 60_000);
    const ok =
      row?.plan === "FREELANCER_PRO" &&
      row?.status === "ACTIVE" &&
      row?.lastStripeEventAt?.getTime() === newest.getTime() &&
      results.every((r) => r !== "conflict");
    if (ok) raced++;
    else console.log(`      round ${round}: ${JSON.stringify(row)} from ${JSON.stringify(results)}`);
  }
  check(
    `${BURST} concurrent deliveries land newest-wins, every round`,
    `${raced}/${ROUNDS}`,
    `${ROUNDS}/${ROUNDS}`,
  );

  // Put the row back the way the pricing checks below expect it.
  await prisma.subscription.deleteMany({ where: { userId: freelancer.id } });
  await linkStripeCustomer(freelancer.id, CUSTOMER);
  await on(SUB, day(20), "FREE", "CANCELED");

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
