import { redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { listSkillsGroupedByCategory } from "@/lib/db/freelancer";
import { listCategories } from "@/lib/db/taxonomy";

import { JobForm } from "../job-form";

export default async function NewJobPage() {
  await requireRole("RECRUITER");
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "RECRUITER") redirect("/onboarding/recruiter");

  const [categories, skillGroups] = await Promise.all([
    listCategories(),
    listSkillsGroupedByCategory(),
  ]);

  return (
    <main className="flex-1">
      <JobForm categories={categories} skillGroups={skillGroups} />
    </main>
  );
}
