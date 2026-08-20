import { notFound, redirect } from "next/navigation";

import { getCurrentProfile, requireRole } from "@/lib/auth/guards";
import { listSkillsGroupedByCategory } from "@/lib/db/freelancer";
import { getEditableJobForRecruiter } from "@/lib/db/job";
import { listCategories } from "@/lib/db/taxonomy";

import { JobForm } from "../../job-form";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("RECRUITER");
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "RECRUITER") redirect("/onboarding/recruiter");

  const { id } = await params;
  // Ownership-scoped: only this recruiter's own DRAFT resolves.
  const job = await getEditableJobForRecruiter(id, profile.profile.id);
  if (!job) notFound();

  const [categories, skillGroups] = await Promise.all([
    listCategories(),
    listSkillsGroupedByCategory(),
  ]);

  return (
    <main className="flex-1">
      <JobForm
        categories={categories}
        skillGroups={skillGroups}
        initial={{
          jobId: job.id,
          title: job.title,
          description: job.description,
          categorySlug: job.category.slug,
          engagementType: job.engagementType,
          budgetMinUsd: job.budgetMinUsd,
          budgetMaxUsd: job.budgetMaxUsd,
          isRemote: job.isRemote,
          location: job.location,
          skillSlugs: job.skills.map((s) => s.skill.slug),
        }}
      />
    </main>
  );
}
