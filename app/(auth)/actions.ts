"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/route-guard";
import { createUserWithRole, getUserAuthState, getUserAuthStateFresh } from "@/lib/db/users";
import {
  roleChoiceSchema,
  sanitizeNextPath,
  signInSchema,
  signUpSchema,
  type AuthNotice,
} from "@/lib/validations/auth";

/**
 * All auth mutations. Server Actions only — there is no client-side auth
 * write path. Every input is Zod-validated here regardless of what the form
 * did or did not enforce, because the caller may be curl, not the form.
 *
 * User-facing errors are emitted as stable codes (AuthNotice), never free
 * text, so nothing an action bounces into the query string can inject copy.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const CALLBACK_PATH = "/api/auth/callback";

const backTo = (path: string, params: Partial<Record<"error" | "message", AuthNotice>>): never => {
  const search = new URLSearchParams(params);
  redirect(`${path}?${search.toString()}`);
};

export async function signUpWithPassword(formData: FormData): Promise<void> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    backTo("/signup", { error: "invalid_input" });
    return;
  }
  const { email, password, role } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${SITE_URL}${CALLBACK_PATH}` },
  });

  if (error) {
    // Deliberately generic: do not leak whether the address is registered.
    backTo("/signup", { error: "signup_failed" });
    return;
  }

  // Fix the role now, on the app-side row. A conflict means the email or id
  // is already taken — say nothing specific (no account enumeration) and let
  // the existing account keep its existing role.
  if (data.user) {
    await createUserWithRole(data.user.id, email, role);
  }

  if (data.session && data.user) {
    // Email confirmation is disabled in this Supabase project — signed in.
    const state = await getUserAuthState(data.user.id);
    redirect(state ? homeFor(state.role, state.hasProfile) : "/onboarding");
  }

  backTo("/signin", { message: "confirm_email" });
}

export async function signInWithPassword(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    backTo("/signin", { error: "invalid_input" });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    backTo("/signin", { error: "invalid_credentials" });
    return;
  }

  const nextPath = sanitizeNextPath(
    typeof formData.get("next") === "string" ? (formData.get("next") as string) : null,
  );
  const state = await getUserAuthState(data.user.id);
  if (!state) redirect("/onboarding");
  redirect(nextPath ?? homeFor(state.role, state.hasProfile));
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  // Optional: the signup form passes the chosen role through so an
  // OAuth-first account lands with the role already decided. Invalid or
  // absent role means the callback sends them to the role chooser instead.
  const roleParsed = roleChoiceSchema.safeParse({ role: formData.get("role") });
  const nextPath = sanitizeNextPath(
    typeof formData.get("next") === "string" ? (formData.get("next") as string) : null,
  );

  const callback = new URL(CALLBACK_PATH, SITE_URL);
  if (roleParsed.success) callback.searchParams.set("role", roleParsed.data.role);
  if (nextPath) callback.searchParams.set("next", nextPath);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });

  if (error || !data.url) {
    backTo("/signin", { error: "google_unavailable" });
    return;
  }
  redirect(data.url);
}

export async function chooseRole(formData: FormData): Promise<void> {
  // Role selection for OAuth-first accounts. Requires a live session; the
  // role is written exactly once (create, never update) and any conflict
  // routes by the EXISTING role — this action cannot change a role, ever.
  const session = await getSession();
  if (!session) redirect("/signin?next=%2Fonboarding");

  const parsed = roleChoiceSchema.safeParse({ role: formData.get("role") });
  if (!parsed.success) {
    backTo("/onboarding", { error: "pick_role" });
    return;
  }

  if (!session.email) {
    backTo("/onboarding", { error: "email_required" });
    return;
  }

  const result = await createUserWithRole(session.userId, session.email, parsed.data.role);
  if (result.ok) {
    redirect(homeFor(result.state.role, result.state.hasProfile));
  }

  // Create failed on a unique conflict. If a row now exists for this session's
  // id, route by its existing role. If not, the conflict was on email — a
  // different account owns this address — so explain the dead-end rather than
  // bouncing back to a chooser that will fail identically forever.
  // Fresh (uncached): this re-read follows the failed create in the same
  // request and must see the true current row, not a memoized null.
  const existing = await getUserAuthStateFresh(session.userId);
  if (existing) redirect(homeFor(existing.role, existing.hasProfile));
  backTo("/onboarding", { error: "email_conflict" });
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/signin");
}
