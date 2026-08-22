import { createHmac } from "node:crypto";

import { prisma } from "../lib/db/client";

/**
 * End-to-end check of the Stripe webhook, against the running dev server.
 *
 * Events are signed here with the same HMAC scheme Stripe uses, so the route's
 * real signature verification runs — no mock, no Stripe account. That is the
 * point: the webhook is the only thing in the product that can move an account
 * onto a paid plan, so "an unsigned request cannot" has to be demonstrated
 * rather than asserted.
 *
 * Requires the dev server to be running with STRIPE_WEBHOOK_SECRET set to the
 * value below. Everything it writes, it puts back.
 */

const URL_ = "http://localhost:3000/api/stripe/webhook";
const SECRET = "whsec_localverifysecret";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`,
  );
}

/** The Stripe-Signature header for a payload, exactly as Stripe builds it. */
function sign(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function post(event: unknown, opts: { secret?: string; skew?: number } = {}) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000) + (opts.skew ?? 0);
  const response = await fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": sign(payload, opts.secret ?? SECRET, timestamp),
    },
    body: payload,
  });
  return response.status;
}

const planOf = async (userId: string) =>
  (await prisma.subscription.findUnique({ where: { userId }, select: { plan: true } }))?.plan ??
  null;

async function main() {
  const user = await prisma.user.findFirst({
    where: { role: "RECRUITER", subscription: null },
    select: { id: true },
  });
  if (!user) throw new Error("no recruiter without a subscription in the seed");

  const CUSTOMER = "cus_webhookverify";
  const SUB = "sub_webhookverify";
  const now = Math.floor(Date.now() / 1000);

  const subscription = (over: Record<string, unknown> = {}) => ({
    id: SUB,
    status: "active",
    cancel_at_period_end: false,
    customer: CUSTOMER,
    metadata: { plan: "RECRUITER_GROWTH", band: "STANDARD", userId: user.id },
    items: { data: [{ current_period_end: now + 2_592_000 }] },
    ...over,
  });

  const event = (type: string, object: unknown, created = now) => ({
    id: `evt_${created}`,
    type,
    created,
    data: { object },
  });

  // ── Signature enforcement ───────────────────────────────────────────────
  const unsigned = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event("customer.subscription.created", subscription())),
  });
  check("an unsigned request is refused", unsigned.status, 400);
  check("no plan was granted by it", await planOf(user.id), null);

  check(
    "a request signed with the WRONG secret is refused",
    await post(event("customer.subscription.created", subscription()), {
      secret: "whsec_attacker",
    }),
    400,
  );
  check("still no plan", await planOf(user.id), null);

  // Stripe's own replay defence: the signed timestamp must be recent.
  check(
    "a replayed old event is refused on its timestamp",
    await post(event("customer.subscription.created", subscription()), { skew: -3600 }),
    400,
  );
  check("still no plan", await planOf(user.id), null);

  // ── The real path ───────────────────────────────────────────────────────
  check(
    "a correctly signed subscription is accepted",
    await post(event("customer.subscription.created", subscription())),
    200,
  );
  check("the plan is now live", await planOf(user.id), "RECRUITER_GROWTH");

  // ── Refusals that still return 200 ──────────────────────────────────────
  check(
    "a subscription with no plan metadata is acknowledged",
    await post(
      event("customer.subscription.updated", subscription({ id: "sub_nometa", metadata: {} })),
      {},
    ),
    200,
  );
  check("but granted nothing", await planOf(user.id), "RECRUITER_GROWTH");

  // The forged upgrade: a real signature is impossible without the secret, but
  // this proves the plan is read from metadata we wrote, not from anything a
  // caller can assert about itself.
  check(
    "an event naming an account that does not exist is acknowledged, not applied",
    await post(
      event(
        "customer.subscription.updated",
        subscription({
          id: "sub_ghost",
          customer: "cus_ghost",
          metadata: {
            plan: "RECRUITER_TEAM",
            userId: "00000000-0000-4000-8000-00000000dead",
          },
        }),
      ),
    ),
    200,
  );
  check("no account was upgraded by it", await planOf(user.id), "RECRUITER_GROWTH");

  // ── Ordering, over HTTP ─────────────────────────────────────────────────
  check(
    "an older delete does not resurrect a cancellation out of order",
    await post(event("customer.subscription.deleted", subscription(), now - 600)),
    200,
  );
  check("the newer state survived", await planOf(user.id), "RECRUITER_GROWTH");

  check(
    "a newer delete does cancel",
    await post(event("customer.subscription.deleted", subscription(), now + 60)),
    200,
  );
  check("the plan is gone", await planOf(user.id), "FREE");

  // ── Cleanup ─────────────────────────────────────────────────────────────
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  check("cleaned up", await planOf(user.id), null);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
