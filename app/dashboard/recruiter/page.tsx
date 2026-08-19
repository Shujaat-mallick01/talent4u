import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";

import { signOut } from "../../(auth)/actions";

export default async function RecruiterDashboardPage() {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("RECRUITER");
  const current = await getCurrentProfile();
  if (!current || current.role !== "RECRUITER") redirect("/onboarding/recruiter");

  return (
    <main>
      <h1>Recruiter dashboard</h1>
      <p>
        Signed in as {user.email} ({current.profile.companyName})
      </p>
      <p>Job posting and the application inbox ship in Phases 2–3.</p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
