import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set. Populate .env.",
  );
}

export const supabaseEnv = { url: SUPABASE_URL, key: SUPABASE_KEY };

/**
 * Supabase client bound to the current request's cookies. Server-side only —
 * Server Components, Server Actions, and Route Handlers.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL as string, SUPABASE_KEY as string, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where Next forbids cookie writes.
          // Safe to ignore: proxy.ts refreshes sessions on every protected
          // request, so the rotated token is persisted there.
        }
      },
    },
  });
}
