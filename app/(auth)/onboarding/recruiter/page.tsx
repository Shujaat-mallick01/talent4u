import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";

import { signOut } from "../../actions";

export default async function RecruiterOnboardingPage() {
  const { user } = await requireRole("RECRUITER");
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard/recruiter");

  return (
    <main>
      <h1>Welcome, recruiter</h1>
      <p>Signed in as {user.email}.</p>
      <p>Company setup (name, domain, verification) ships in Phase 1.</p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
