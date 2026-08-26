"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  /** Rendered by the shell; passed as an element so this stays a client file. */
  icon: React.ReactNode;
  /** Small count shown right-aligned, e.g. open flags. Zero renders nothing. */
  count?: number;
};

export type NavGroup = { label?: string; items: NavItem[] };

const useIsActive = () => {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
};

/**
 * The rail's links and their active state.
 *
 * Client-only because active state needs the pathname, and "which page am I
 * on" is the single thing the old dashboards never told anyone.
 *
 * Active is marked three ways, not one: a 3px Signal Red bar flush to the left
 * edge, an Ink label against Slate, and aria-current. Colour alone would fail
 * the same rule the status pills follow.
 */
export function NavItems({ groups }: { groups: NavGroup[] }) {
  const isActive = useIsActive();

  return (
    <>
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className={cn(gi > 0 && "mt-6")}>
          {group.label ? (
            <p className="t-label px-6 pb-2 text-muted-foreground">{group.label}</p>
          ) : null}
          <ul>
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href} className="relative">
                  {active ? (
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
                  ) : null}
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 px-6 text-[15px] font-medium",
                      "transition-colors duration-[120ms] ease-out",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count ? (
                      <span className="t-label shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground">
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * The same links as a horizontal strip, for viewports too narrow for the rail.
 * A scrollable strip rather than a hamburger drawer: no JavaScript, nothing to
 * trap focus in, and the destinations stay visible instead of hidden behind an
 * affordance the user has to discover.
 */
export function NavStrip({ groups }: { groups: NavGroup[] }) {
  const isActive = useIsActive();
  const items = groups.flatMap((g) => g.items);

  return (
    <ul className="flex overflow-x-auto">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 border-b-2 px-4 text-[15px] font-medium whitespace-nowrap",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              {item.label}
              {item.count ? (
                <span className="t-label rounded-full bg-primary px-1 text-primary-foreground">
                  {item.count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
