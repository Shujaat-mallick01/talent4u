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
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { userId: data.user.id, email: data.user.email ?? null };
}
