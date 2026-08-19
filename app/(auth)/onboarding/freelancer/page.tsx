import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";

import { signOut } from "../../actions";

export default async function FreelancerOnboardingPage() {
  const { user } = await requireRole("FREELANCER");
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard/freelancer");

  return (
    <main>
      <h1>Welcome, freelancer</h1>
      <p>Signed in as {user.email}.</p>
      <p>Profile setup (headline, bio, skills, rate) ships in Phase 1.</p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
