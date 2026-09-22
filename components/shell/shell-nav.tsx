import {
  IconBriefcase,
  IconBuilding,
  IconCard,
  IconGauge,
  IconHandshakeless,
  IconImage,
  IconMessage,
  IconPin,
  IconSearch,
  IconSettings,
  IconShield,
  IconUser,
} from "@/components/ui/icon";
import { getCurrentProfile } from "@/lib/auth/guards";
import { countUnreadConversations } from "@/lib/db/message";

import type { NavGroup } from "./nav-items";

/**
 * What the signed-in rail contains, for whoever is asking.
 *
 * Lifted out of the dashboard layout because the rail is no longer only a
 * dashboard thing: a signed-in freelancer browsing jobs should stay inside the
 * product rather than being thrown back onto the marketing site the moment
 * they click the one link the rail exists to offer. Both the dashboard layout
 * and AdaptiveChrome build the rail from this, so the two can never disagree
 * about what is in it.
 *
 * Returns null when there is nobody to build a rail for — signed out, or
 * signed in without a finished profile. Callers decide what that means:
 * the dashboard redirects into onboarding, public pages fall back to the
 * marketing chrome.
 */
export type ShellNav = {
  groups: NavGroup[];
  account: {
    name: string;
    role: string;
    href?: string;
    avatarUrl?: string | null;
    kind?: "person" | "company";
  };
  /** ADMIN accounts have no profile and belong in /admin, not the rail. */
  role: "FREELANCER" | "RECRUITER";
};

export async function buildShellNav(): Promise<ShellNav | null> {
  // Null when signed out, when the account is mid-onboarding, and for ADMIN —
  // none of which has a rail to build.
  const current = await getCurrentProfile();
  if (!current) return null;

  // The badge is the whole reason an inbox has one: somebody wrote to you and
  // nothing else in the product will tell you.
  const unread = await countUnreadConversations(current.profile.userId);

  if (current.role === "RECRUITER") {
    return {
      role: "RECRUITER",
      groups: [
        {
          items: [
            { href: "/dashboard/recruiter", label: "Your jobs", icon: <IconBriefcase /> },
            {
              href: "/dashboard/recruiter/candidates",
              label: "Find candidates",
              icon: <IconSearch />,
            },
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
            { href: "/dashboard/billing", label: "Plan and billing", icon: <IconCard /> },
          ],
        },
      ],
      account: {
        name: current.profile.companyName,
        role: "Company",
        href: `/companies/${current.profile.slug}`,
        avatarUrl: current.profile.logoUrl,
        kind: "company",
      },
    };
  }

  return {
    role: "FREELANCER",
    groups: [
      {
        items: [
          { href: "/dashboard/freelancer", label: "Applications", icon: <IconGauge /> },
          { href: "/dashboard/saved", label: "Saved jobs", icon: <IconPin /> },
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
          {
            href: "/dashboard/freelancer/portfolio",
            label: "Portfolio",
            icon: <IconImage />,
          },
          { href: "/dashboard/billing", label: "Plan and billing", icon: <IconCard /> },
        ],
      },
    ],
    account: {
      name: current.profile.displayName,
      role: "Freelancer",
      href: `/freelancers/${current.profile.slug}`,
      avatarUrl: current.profile.avatarUrl,
      kind: "person",
    },
  };
}
