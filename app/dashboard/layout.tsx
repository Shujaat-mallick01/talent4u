import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import type { NavGroup } from "@/components/shell/nav-items";
import {
  IconBriefcase,
  IconBuilding,
  IconGauge,
  IconHandshakeless,
  IconMessage,
  IconSearch,
  IconSettings,
  IconShield,
  IconUser,
} from "@/components/ui/icon";
import { getCurrentProfile, requireUser } from "@/lib/auth/guards";
import { countUnreadConversations } from "@/lib/db/message";

/**
 * The signed-in product shell for both roles.
 *
 * Nav is built from the viewer's actual role rather than shown-then-gated, so
 * a freelancer never sees a link that would bounce them, and a recruiter's
 * verification page stops being reachable only by clicking a status pill.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const current = await getCurrentProfile();
  // The badge is the whole reason an inbox has one: somebody wrote to you and
  // nothing else in the product will tell you.
  const unread = current ? await countUnreadConversations(user.id) : 0;

  // Onboarding is not finished; the shell has no profile to render.
  if (!current) {
    if (user.role === "ADMIN") redirect("/admin");
    redirect(user.role === "RECRUITER" ? "/onboarding/recruiter" : "/onboarding/freelancer");
  }

  const groups: NavGroup[] =
    current.role === "RECRUITER"
      ? [
          {
            items: [
              { href: "/dashboard/recruiter", label: "Your jobs", icon: <IconBriefcase /> },
              {
                href: "/dashboard/messages",
                label: "Messages",
                icon: <IconMessage />,
                count: unread,
              },
              {
                href: "/dashboard/recruiter/engagements",
                label: "Engagements",
                icon: <IconHandshakeless />,
              },
            ],
          },
          {
            label: "Company",
            items: [
              {
                href: "/dashboard/recruiter/verification",
                label: "Verification",
                icon: <IconShield />,
              },
              {
                href: "/dashboard/recruiter/company",
                label: "Company details",
                icon: <IconSettings />,
              },
              {
                href: `/companies/${current.profile.slug}`,
                label: "Public page",
                icon: <IconBuilding />,
              },
            ],
          },
        ]
      : [
          {
            items: [
              { href: "/dashboard/freelancer", label: "Applications", icon: <IconGauge /> },
              {
                href: "/dashboard/messages",
                label: "Messages",
                icon: <IconMessage />,
                count: unread,
              },
              {
                href: "/dashboard/freelancer/engagements",
                label: "Engagements",
                icon: <IconHandshakeless />,
              },
            ],
          },
          {
            // Renamed from "Find work": the group now holds the profile that
            // does the finding, not only the browse link.
            label: "Work and profile",
            items: [
              { href: "/jobs", label: "Browse jobs", icon: <IconSearch /> },
              // Mirrors the recruiter's: standing first, then the public page
              // it appears on. Without it the only route to verification was
              // a link nobody had a reason to look for.
              {
                href: "/dashboard/freelancer/verification",
                label: "Verification",
                icon: <IconShield />,
              },
              {
                href: `/freelancers/${current.profile.slug}`,
                label: "Your profile",
                icon: <IconUser />,
              },
              {
                href: "/dashboard/freelancer/profile",
                label: "Edit profile",
                icon: <IconSettings />,
              },
            ],
          },
        ];

  const account =
    current.role === "RECRUITER"
      ? {
          name: current.profile.companyName,
          role: "Company",
          href: `/companies/${current.profile.slug}`,
        }
      : {
          name: current.profile.displayName,
          role: "Freelancer",
          href: `/freelancers/${current.profile.slug}`,
        };

  return (
    <AppShell groups={groups} account={account}>
      {children}
    </AppShell>
  );
}
