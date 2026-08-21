import { redirect } from "next/navigation";

import { EngagementsScreen } from "@/components/engagements/engagements-page";
import { requireRole } from "@/lib/auth/guards";
import { listEngagementsForUser } from "@/lib/services/engagement";

export const metadata = { title: "Engagements" };

export default async function RecruiterEngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("RECRUITER");

  const [data, params] = await Promise.all([listEngagementsForUser(user.id), searchParams]);
  if (!data.ok) {
    // A removed employer keeps their history but takes no new action here.
    redirect(data.reason === "banned" ? "/dashboard/recruiter" : "/onboarding/recruiter");
  }

  return (
    <EngagementsScreen data={data} noticeCode={params.notice} backHref="/dashboard/recruiter" />
  );
}
