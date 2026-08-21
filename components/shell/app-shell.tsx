import Link from "next/link";

import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { IconLogout } from "@/components/ui/icon";

import { Logo } from "./logo";
import { NavItems, NavStrip, type NavGroup } from "./nav-items";

/**
 * The signed-in product shell.
 *
 * CRM brief: "Fixed 232px left rail on Paper with a 1px Line right border,
 * full viewport height. TALENT4U primary lockup pinned top left… Rail bottom
 * holds the account row… separated by a 1px Line top border."
 *
 * Replaces what was there before, which was nothing: every dashboard page
 * rendered the marketing header, its own ad-hoc page header with a second
 * Sign out button, and the marketing footer inviting the signed-in user to
 * sign up. There was no way to move between product screens at all.
 *
 * Below the rail's breakpoint the same links become a horizontal strip rather
 * than a hamburger drawer — no JavaScript, no focus trap, and the destinations
 * stay visible instead of hiding behind an affordance to be discovered.
 */
export function AppShell({
  groups,
  account,
  children,
}: {
  groups: NavGroup[];
  account: { name: string; role: string; href?: string };
  children: React.ReactNode;
}) {
  const accountRow = (
    <div className="flex items-center gap-3 px-6 py-3">
      <div className="min-w-0 flex-1">
        {account.href ? (
          <Link
            href={account.href}
            className="block truncate text-[15px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {account.name}
          </Link>
        ) : (
          <p className="truncate text-[15px] font-medium">{account.name}</p>
        )}
        <p className="t-label truncate text-muted-foreground">{account.role}</p>
      </div>
      {/* The product's only Sign out. */}
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
          <IconLogout />
        </Button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      {/* Rail — 1024px and up. */}
      <aside className="sticky top-0 z-30 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-border bg-background lg:flex">
        <div className="border-b border-border px-6 py-4">
          <Link
            href="/"
            aria-label="Talent4u home"
            className="inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Logo className="h-6 w-auto" />
          </Link>
        </div>
        <nav aria-label="Product" className="flex-1 overflow-y-auto py-4">
          <NavItems groups={groups} />
        </nav>
        <div className="border-t border-border">{accountRow}</div>
      </aside>

      {/* Compact header + link strip — below 1024px. */}
      <div className="sticky top-0 z-30 border-b border-border bg-background lg:hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <Link
            href="/"
            aria-label="Talent4u home"
            className="inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Logo className="h-5 w-auto" />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 text-right">
              <p className="truncate text-[14px] font-medium">{account.name}</p>
              <p className="t-label truncate text-muted-foreground">{account.role}</p>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
                <IconLogout />
              </Button>
            </form>
          </div>
        </div>
        <nav aria-label="Product">
          <NavStrip groups={groups} />
        </nav>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
