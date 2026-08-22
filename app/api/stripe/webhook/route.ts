import { NextResponse, type NextRequest } from "next/server";

import type Stripe from "stripe";

import { getStripe, stripeConfigured, webhookSecret } from "@/lib/billing/stripe";
import { applyStripeEvent } from "@/lib/services/billing";

/**
 * The Stripe webhook. This is the ONLY thing in the codebase that may move an
 * account onto a paid plan.
 *
 * That is the whole security model. A checkout redirect proves nothing — a
 * person can open /dashboard/billing?notice=checkout_complete by typing it —
 * so the success page reports nothing and grants nothing. Stripe's signed
 * event is the only evidence that money changed hands, and it is verified with
 * the signing secret before a single field is read.
 *
 * Status codes matter here, because they control Stripe's retries:
 *   400 — the signature did not verify. Never retried, and it should not be:
 *         either the secret is wrong or the request did not come from Stripe.
 *   200 — understood, or understood-and-deliberately-ignored. Both are final.
 *   500 — we broke. Stripe retries with backoff for up to three days, which is
 *         exactly what should happen when a database is briefly down.
 */

/** Node runtime: signature verification needs the exact raw body. */
export const runtime = "nodejs";
/** Never cached, never prerendered — every request is a unique signed event. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = webhookSecret();
  if (!stripeConfigured() || !secret) {
    // A deployment without billing configured should not accept events it
    // cannot verify. 503 rather than 200: silently swallowing a real payment
    // event would leave a paying customer on the free plan.
    console.error("[stripe] webhook received but STRIPE_* env is not configured");
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  // The raw text, before any JSON parsing: the signature covers the exact
  // bytes Stripe sent, and a parse-and-restringify round trip breaks it.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch (error: unknown) {
    // Includes an expired timestamp, which is how replay is prevented.
    console.error(
      "[stripe] signature verification failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await applyStripeEvent(event);
    if (!outcome.handled) {
      // Acknowledged on purpose. These are permanent conditions — an event
      // type we do not model, a subscription with no plan metadata — and
      // retrying them for three days would only fill the log with the same
      // line. They are logged once, here, with the id needed to find them.
      console.warn(`[stripe] ${event.type} (${event.id}) not applied: ${outcome.detail}`);
    }
    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    // Transient by assumption — a database blip, a Stripe timeout on the
    // subscription fetch. 500 asks Stripe to try again, which is the correct
    // answer for anything that might succeed on a retry.
    console.error(
      `[stripe] ${event.type} (${event.id}) failed:`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
