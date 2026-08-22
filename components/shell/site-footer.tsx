import Link from "next/link";

import { Logo } from "./logo";

/**
 * The public footer.
 *
 * It carries the links a stranger uses to decide whether this is a real
 * company: terms, privacy, a way to reach a person, and the public record of
 * who we have removed. A hiring site that plans to ask for government ID and
 * card details, with an empty footer, reads exactly like the sites our own
 * safety scanner exists to catch.
 *
 * Two columns of links rather than one row, because "product" and "company"
 * are answers to different questions and a single line of eight items is a
 * list nobody reads.
 */

const GROUPS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      // Labelled by what the reader finds there, not by who we imagine them
      // to be: /jobs is where freelancers find work, /freelancers is the
      // candidate directory a hirer browses, and pricing is pricing.
      { href: "/jobs", label: "Browse jobs" },
      { href: "/freelancers", label: "Find freelancers" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/removed-employers", label: "Removed employers" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap justify-between gap-x-12 gap-y-8 px-6 py-10 text-sm text-muted-foreground">
        <div className="max-w-xs">
          <Logo className="h-5 w-auto text-foreground" />
          <p className="mt-2">0% commission. You keep 100% of what you earn.</p>
          <p className="mt-2 text-[13px] leading-[18px]">
            We match, verify and publish reputation. We never hold, escrow or transmit money between
            users.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-12 gap-y-8">
          {GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="t-label text-muted-foreground">{group.heading}</h2>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="rounded-[2px] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
