"use server";

import { redirect } from "next/navigation";

import { resubscribeByToken } from "@/lib/db/digest";

/**
 * Turns the digest back on from the unsubscribe page.
 *
 * No session: the token IS the authorization, exactly as it is for turning it
 * off. Requiring a login here would strand the person a scanner unsubscribed —
 * they clicked nothing, and now they must sign in to undo something they never
 * did.
 */
export async function resubscribe(formData: FormData): Promise<void> {
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") redirect("/unsubscribe?state=invalid");

  const result = await resubscribeByToken(token);
  redirect(
    result
      ? `/unsubscribe?state=resubscribed&token=${encodeURIComponent(token)}`
      : "/unsubscribe?state=invalid",
  );
}
