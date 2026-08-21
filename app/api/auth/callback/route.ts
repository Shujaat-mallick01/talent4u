import { NextResponse, type NextRequest } from "next/server";

import type { EmailOtpType } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { homeFor } from "@/lib/auth/route-guard";
import {
  createUserWithRole,
  getUserAuthState,
  getUserAuthStateFresh,
  markEmailVerified,
} from "@/lib/db/users";
import { sanitizeNextPath, selectableRoleSchema, type AuthNotice } from "@/lib/validations/auth";

/**
 * Lands both OAuth redirects (?code=, PKCE) and email confirmation links
 * (?token_hash=&type=). Establishes the session, ensures the app User row
 * exists — creating it with the role carried from the signup form when
 * there is one — and routes to wherever the account belongs.
 *
 * A route handler under app/api/ because it mutates (creates the User row,
 * marks email verified), per the CLAUDE.md convention that mutations live in
 * Server Actions or app/api/ handlers. It is the Supabase redirect target,
 * so this path must be on the project's redirect allowlist.
 */

const OTP_TYPES: ReadonlyArray<EmailOtpType> = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type");
  const nextPath = sanitizeNextPath(url.searchParams.get("next"));
  const roleParsed = selectableRoleSchema.safeParse(url.searchParams.get("role"));

  const fail = (notice: AuthNotice) =>
    NextResponse.redirect(new URL(`/signin?error=${notice}`, request.url));

  const supabase = await createSupabaseServerClient();

  if (tokenHash && typeParam && (OTP_TYPES as readonly string[]).includes(typeParam)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: typeParam as EmailOtpType,
    });
    if (error) return fail("link_invalid");
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("oauth_failed");
  } else {
    return fail("missing_code");
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail("oauth_failed");

  // A recovery link's whole purpose is to set a new password, so it lands on
  // the reset form rather than the user's dashboard — otherwise the session it
  // just established would silently sign them in and the password they came
  // to change would stay as it was.
  if (typeParam === "recovery") {
    return NextResponse.redirect(new URL("/reset-password", request.url));
  }

  let state = await getUserAuthState(data.user.id);

  if (!state && roleParsed.success && data.user.email) {
    const created = await createUserWithRole(data.user.id, data.user.email, roleParsed.data);
    if (created.ok) {
      state = created.state;
    } else {
      // Lost a create race, or the email belongs to another account.
      // Fresh (uncached) read: this runs AFTER the create attempt in the same
      // request, so the memoized pre-create null must not be reused.
      state = await getUserAuthStateFresh(data.user.id);
      if (!state) return fail("email_conflict");
    }
  }

  if (!state) {
    // OAuth-first login with no role chosen yet.
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  if (data.user.email_confirmed_at) {
    await markEmailVerified(state.id);
  }

  return NextResponse.redirect(
    new URL(nextPath ?? homeFor(state.role, state.hasProfile), request.url),
  );
}
