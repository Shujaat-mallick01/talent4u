import { redirect } from "next/navigation";

import { AuthLayout } from "@/components/auth/auth-layout";
import { RoleChoice } from "@/components/auth/role-choice";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/route-guard";
import { getUserAuthState } from "@/lib/db/users";

import { resolveNotice } from "../notices";
import { chooseRole } from "../actions";

export const metadata = { title: "Choose your role", robots: { index: false, follow: false } };

/**
 * Role chooser for OAuth-first accounts (a Supabase session exists but no
 * app User row). Anyone whose role is already fixed is bounced to where
 * they belong — this page can never re-offer the choice.
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

  return (
    <AuthLayout
      title="One question left"
      intro={<>Your account is created. This decides which product you get.</>}
    >
      {error ? (
        <Notice tone="error" className="mb-5">
          {error}
        </Notice>
      ) : null}

      <form action={chooseRole} className="space-y-5">
        <RoleChoice legend="Which are you?" />
        <Button type="submit" size="lg" className="w-full">
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
