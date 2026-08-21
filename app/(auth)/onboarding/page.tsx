import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/route-guard";
import { getUserAuthState } from "@/lib/db/users";

import { resolveNotice } from "../notices";
import { chooseRole } from "../actions";

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
    <main id="main">
      <h1>One last thing</h1>
      <p>How will you use Talent4u? This cannot be changed later.</p>
      {error ? <p role="alert">{error}</p> : null}

      <form action={chooseRole}>
        <label>
          <input type="radio" name="role" value="FREELANCER" required /> Freelancer — I want to
          find work
        </label>
        <br />
        <label>
          <input type="radio" name="role" value="RECRUITER" required /> Recruiter — I want to hire
        </label>
        <br />
        <button type="submit">Continue</button>
      </form>
    </main>
  );
}
