import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { buildShellNav } from "@/components/shell/shell-nav";
import { requireUser } from "@/lib/auth/guards";

/**
 * The signed-in product shell for both roles.
 *
 * Nav is built from the viewer's actual role rather than shown-then-gated, so
 * a freelancer never sees a link that would bounce them, and a recruiter's
 * verification page stops being reachable only by clicking a status pill. The
 * rail itself lives in components/shell/shell-nav.tsx, because public pages
 * render it too — see AdaptiveChrome.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const nav = await buildShellNav();

  // Onboarding is not finished; the shell has no profile to render.
  if (!nav) {
    if (user.role === "ADMIN") redirect("/admin");
    redirect(user.role === "RECRUITER" ? "/onboarding/recruiter" : "/onboarding/freelancer");
  }

  return (
    <AppShell groups={nav.groups} account={nav.account}>
      {children}
    </AppShell>
  );
}
