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
      <div className="mx-auto grid w-full max-w-[var(--container-marketing)] gap-x-12 gap-y-10 px-6 py-14 text-[15px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo className="w-[144px] text-foreground" />
          <p className="mt-2">0% commission. You keep 100% of what you earn.</p>
          <p className="mt-2 text-[13px] leading-[18px]">
            We match, verify and publish reputation. We never hold, escrow or transmit money between
            users.
          </p>
        </div>

        {GROUPS.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="t-label text-muted-foreground">{group.heading}</h2>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="rounded-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
