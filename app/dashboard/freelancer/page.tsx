import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";

import { signOut } from "../../(auth)/actions";

export default async function FreelancerDashboardPage() {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("FREELANCER");
  const current = await getCurrentProfile();
  if (!current || current.role !== "FREELANCER") redirect("/onboarding/freelancer");

  return (
    <main>
      <h1>Freelancer dashboard</h1>
      <p>
        Signed in as {user.email} ({current.profile.displayName})
      </p>
      <p>
        <Link href="/jobs" className="underline">
          Browse open jobs
        </Link>{" "}
        — applications and messaging ship in Phase 3.
      </p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
