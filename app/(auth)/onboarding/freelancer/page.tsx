import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { listSkillsGroupedByCategory } from "@/lib/db/freelancer";

import { FreelancerOnboardingForm } from "./onboarding-form";

export default async function FreelancerOnboardingPage() {
  const { user } = await requireRole("FREELANCER");
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard/freelancer");

  const skillGroups = await listSkillsGroupedByCategory();

  return (
    <main id="main" className="flex-1">
      <FreelancerOnboardingForm email={user.email} skillGroups={skillGroups} />
    </main>
  );
}
