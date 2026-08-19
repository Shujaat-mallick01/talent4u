import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveProtectedRoute, type AuthState } from "@/lib/auth/route-guard";
import { supabaseEnv } from "@/lib/auth/supabase";
import { getUserAuthState } from "@/lib/db/users";

/**
 * Session refresh plus routing for the protected areas. This layer is a
 * convenience — the same decisions are re-made server-side by lib/auth's
 * guards inside every protected page and action, so bypassing the proxy
 * (curl, a direct fetch) changes nothing about what a caller can reach.
 *
 * Runs on the Node runtime (Next 16 proxy default), so the one indexed
 * User lookup per protected navigation goes through the normal Prisma
 * client. The matcher keeps public traffic — jobs, profiles, marketing —
 * entirely out of this file.
 */

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the JWT with the Auth server and refreshes expired
  // sessions via the setAll hook above. Never trust the cookie contents alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let state: AuthState;
  if (!user) {
    state = { kind: "logged-out" };
  } else {
    const account = await getUserAuthState(user.id);
    state = account
      ? { kind: "account", role: account.role, hasProfile: account.hasProfile }
      : { kind: "no-account" };
  }

  const decision = resolveProtectedRoute(request.nextUrl.pathname, state);
  if (!decision.allow) {
    const redirectResponse = NextResponse.redirect(
      new URL(decision.redirectTo, request.url),
    );
    // Carry any refreshed session cookies onto the redirect.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/onboarding/:path*"],
};
