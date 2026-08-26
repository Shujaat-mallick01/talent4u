import { redirect } from "next/navigation";

import { RoleStep } from "@/components/auth/role-step";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/route-guard";
import { getUserAuthState } from "@/lib/db/users";

import { resolveNotice } from "../notices";
import { chooseRole } from "../actions";

export const metadata = { title: "Choose your role", robots: { index: false, follow: false } };

/**
 * The first question every new account answers, however they signed up.
 *
 * A Supabase session exists and no app User row does — that is true of an
 * OAuth-first account and, since signup stopped asking for a role, of every
 * password account too. Anyone whose role is already fixed is bounced to where
 * they belong, so this page can never re-offer the choice.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/signin?next=%2Fonboarding");

  const existing = await getUserAuthState(session.userId);
  if (existing) redirect(homeFor(existing.role, existing.hasProfile));

  const { error: errorCode } = await searchParams;
  const error = resolveNotice(errorCode);

  return <RoleStep action={chooseRole} error={error} />;
}
