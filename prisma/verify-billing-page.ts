import { prisma } from "../lib/db/client";

/**
 * The billing page, rendered by the real server for a real signed-in account.
 *
 * What this proves that a unit test cannot: the gate that stops a subscriber
 * opening a SECOND checkout is actually on the page. getBillingView deciding
 * `canCheckout: false` is worth nothing if the button still renders, and the
 * consequence of getting it wrong is a customer billed for two plans at once.
 *
 * Requires the dev server. Everything it writes, it puts back.
 *
 *   npm run dev
 *   npx tsx --env-file=.env prisma/verify-billing-page.ts
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
// Every seeded account shares one password; .env.example documents it.
const PASSWORD = process.env.DEV_SEED_PASSWORD ?? "Talent4u-dev-2026";
// @supabase/ssr splits the session cookie at this width.
const MAX_CHUNK = 3180;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** A session cookie for a seeded account, in the form @supabase/ssr reads. */
async function cookieFor(email: string): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  }

  const name = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const value = `base64-${Buffer.from(await response.text(), "utf-8").toString("base64")}`;
  if (value.length <= MAX_CHUNK) return `${name}=${value}`;

  const chunks: string[] = [];
  for (let i = 0, n = 0; i < value.length; i += MAX_CHUNK, n += 1) {
    chunks.push(`${name}.${n}=${value.slice(i, i + MAX_CHUNK)}`);
  }
  return chunks.join("; ");
}

async function main() {
  const recruiter = await prisma.user.findFirstOrThrow({
    where: { role: "RECRUITER", subscription: { plan: "RECRUITER_GROWTH" } },
    select: { id: true, email: true, subscription: { select: { stripeSubscriptionId: true } } },
  });
  const original = recruiter.subscription?.stripeSubscriptionId ?? null;
  const cookie = await cookieFor(recruiter.email);

  const load = async () => {
    const response = await fetch(`${SITE}/dashboard/billing`, {
      headers: { cookie },
      redirect: "manual",
    });
    return { status: response.status, html: await response.text() };
  };
  const setSubscription = (data: Record<string, unknown>) =>
    prisma.subscription.update({ where: { userId: recruiter.id }, data });

  // ── No subscription with Stripe: checkout is the way in ─────────────────
  await setSubscription({ stripeSubscriptionId: null, stripeCustomerId: null });
  const fresh = await load();
  check("the page renders for a signed-in recruiter", fresh.status === 200, `status ${fresh.status}`);
  check("their plan is named as current", fresh.html.includes("Your current plan"));
  check("the other plan is offered at checkout", fresh.html.includes("Get Team"));
  check("and no portal switch is shown", !fresh.html.includes("Switch in billing portal"));

  // ── One exists: every change belongs in the portal ───────────────────────
  await setSubscription({
    stripeSubscriptionId: "sub_pagecheck_t4u",
    stripeCustomerId: "cus_pagecheck_t4u",
  });
  const subscribed = await load();
  check("the page still renders", subscribed.status === 200, `status ${subscribed.status}`);
  check("the upgrade is NOT a second checkout", !subscribed.html.includes("Get Team"));
  check("it is a portal switch", subscribed.html.includes("Switch in billing portal"));

  // ── Lapsed: the plan they bought is on hold, not on sale ────────────────
  await setSubscription({ status: "PAST_DUE" });
  const lapsed = await load();
  check("the lapse is explained", lapsed.html.includes("Your last payment did not go through"));
  check("their own plan is marked paused", lapsed.html.includes("paused until payment goes through"));
  check("the way out is the portal", lapsed.html.includes("Fix payment in portal"));
  check("and it is not offered for sale again", !lapsed.html.includes("Get Growth"));

  // ── Grace-expired: not a lapse, and it must not claim to be one ─────────
  //
  // The row still says ACTIVE, but its period ended two months ago and Stripe
  // has said nothing since. The entitlement is gone. Nobody's card failed, and
  // the portal has nothing in it to switch, so telling this person to "fix
  // payment" would send them somewhere empty and leave them stranded on FREE
  // with no way to start paying again.
  await setSubscription({
    status: "ACTIVE",
    stripeSubscriptionId: "sub_pagecheck_t4u",
    currentPeriodEnd: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
  });
  const expired = await load();
  check("the page renders", expired.status === 200, `status ${expired.status}`);
  check(
    "it does NOT blame a payment that never failed",
    !expired.html.includes("Your last payment did not go through"),
  );
  check(
    "it explains that Stripe has gone quiet",
    expired.html.includes("not had an update from Stripe"),
  );
  check("and checkout is open again", expired.html.includes("Get Team"));
  check("with no dead-end portal button", !expired.html.includes("Fix payment in portal"));
  check("and no past date shown as a renewal", !expired.html.includes("Renews"));

  await setSubscription({
    status: "ACTIVE",
    stripeSubscriptionId: original,
    stripeCustomerId: null,
    currentPeriodEnd: null,
  });
  const restored = await load();
  check("the account is back as it was", restored.html.includes("Your current plan"));

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
