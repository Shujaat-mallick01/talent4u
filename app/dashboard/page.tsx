import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { homeFor } from "@/lib/auth/route-guard";

// Bare /dashboard is only ever a router: send the account where it belongs.
export default async function DashboardPage(): Promise<never> {
  const { user } = await requireUser();
  redirect(homeFor(user.role, user.hasProfile));
}
