import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client authenticated with the SECRET key, for privileged
 * server-side work the request-scoped client cannot do — here, writing to
 * Storage without per-bucket RLS policies.
 *
 * The "server-only" import makes this module a build error if it is ever
 * pulled into a Client Component, so the secret key can never ship to the
 * browser. Callers must still do their own authorization first.
 */

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY are not set. The admin client (Storage) needs them.",
    );
  }

  client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
