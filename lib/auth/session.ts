import { cache } from "react";

import { createSupabaseServerClient } from "./supabase";

export type Session = {
  /** Supabase auth.users.id — identical to the app's User.id. */
  userId: string;
  email: string | null;
};

/**
 * The current request's authenticated session, or null.
 *
 * Deliberately built on supabase.auth.getUser(), which verifies the JWT
 * against the Auth server — not on the client's getSession(), which trusts
 * whatever the cookie claims. Anything making authorization decisions must
 * go through here.
 *
 * cache()-wrapped so a request that consults the session several times
 * (generateMetadata + page + a component) pays one Auth round trip. Outside
 * a React request scope, cache() degrades to a plain call.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { userId: data.user.id, email: data.user.email ?? null };
});
