import { redirect } from "next/navigation";

import { EngagementsScreen } from "@/components/engagements/engagements-page";
import { requireRole } from "@/lib/auth/guards";
import { listEngagementsForUser } from "@/lib/services/engagement";

export const metadata = { title: "Engagements" };

export default async function FreelancerEngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  // Guarded here, not just in the proxy — curl hits the same wall.
  const { user } = await requireRole("FREELANCER");

  const [data, params] = await Promise.all([listEngagementsForUser(user.id), searchParams]);
  if (!data.ok) redirect("/onboarding/freelancer");

  return (
    <EngagementsScreen
      data={data}
      noticeCode={params.notice}
    />
  );
}
