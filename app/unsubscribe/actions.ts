"use server";

import { redirect } from "next/navigation";

import { resubscribeByToken } from "@/lib/db/digest";
import { callerIp, checkRateLimit } from "@/lib/services/rate-limit";

/**
 * Turns the digest back on from the unsubscribe page.
 *
 * No session: the token IS the authorization, exactly as it is for turning it
 * off. Requiring a login here would strand the person a scanner unsubscribed —
 * they clicked nothing, and now they must sign in to undo something they never
 * did.
 */
export async function resubscribe(formData: FormData): Promise<void> {
  // The only unauthenticated write in the product that is addressed by a
  // secret rather than by a session. The token is 192 bits and not realistically
  // guessable, but an unauthenticated endpoint that hits the database on every
  // call should not be free to hammer — and a limit here costs a real person
  // nothing, since they click this once.
  const limit = await checkRateLimit("password-reset", await callerIp());
  if (!limit.allowed) redirect("/unsubscribe?state=invalid");

  const token = formData.get("token");
  if (typeof token !== "string" || token === "") redirect("/unsubscribe?state=invalid");

  const result = await resubscribeByToken(token);
  redirect(
    result
      ? `/unsubscribe?state=resubscribed&token=${encodeURIComponent(token)}`
      : "/unsubscribe?state=invalid",
  );
}
