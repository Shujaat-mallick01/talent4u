import { AppShell } from "@/components/shell/app-shell";
import type { NavGroup } from "@/components/shell/nav-items";
import { IconBuilding, IconFlag, IconGauge } from "@/components/ui/icon";
import { requireRole } from "@/lib/auth/guards";
import { getModerationCounts } from "@/lib/db/moderation";

/**
 * The moderation shell. The queue counts sit in the nav so an admin can see
 * there is work waiting without opening the page — which is the whole reason
 * a moderation queue has a badge.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireRole("ADMIN");
  const counts = await getModerationCounts();

  // One queue, one link. The three sections live on the same page, so a
  // second nav item pointing at an anchor would mark two links current.
  const groups: NavGroup[] = [
    {
      items: [
        {
          href: "/admin",
          label: "Moderation queue",
          icon: <IconFlag />,
          count: counts.openFlags +
            counts.openReports +
            counts.pendingVerifications +
            counts.pendingFreelancerVerifications,
        },
        {
          href: "/admin/metrics",
          label: "Metrics",
          icon: <IconGauge />,
        },
      ],
    },
    {
      label: "Public",
      items: [
        {
          href: "/removed-employers",
          label: "Removals page",
          icon: <IconBuilding />,
        },
      ],
    },
  ];

  return (
    <AppShell groups={groups} account={{ name: user.email, role: "Admin" }}>
      {children}
    </AppShell>
  );
}
