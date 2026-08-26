import type { Metadata } from "next";
import Link from "next/link";

import { Orbit } from "@/components/brand/orbit";
import { Button } from "@/components/ui/button";
import { IconArrowRight } from "@/components/ui/icon";

/**
 * The 404.
 *
 * Renders inside the root layout only, so it carries no site header — the way
 * back has to be on the page itself. Left-aligned at the same  as every
 * other prose page rather than centred, because a centred 404 with a huge
 * numeral is decoration; this is a dead end that needs directions.
 *
 * A real person most often lands here from a stale job link, so the copy names
 * that case instead of the generic "the page you are looking for".
 */

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

const ONWARD = [
  {
    href: "/pricing",
    title: "Pricing",
    line: "What Pro and Growth cost in your country. Browsing and applying stay free.",
  },
  {
    href: "/removed-employers",
    title: "Removed employers",
    line: "Every company removed from Talent4u, with the reason we removed it.",
  },
] as const;

export default function NotFound() {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        {/* The one graphic on the page, at the landing hero's exact size and
            colour so a dead end still opens like the rest of the product. */}
        <div className="flex items-center gap-3">
          <Orbit className="size-7 text-primary" />
          <p className="t-label text-muted-foreground">404 · not found</p>
        </div>

        <h1 className="t-display-2 mt-6">This page isn&apos;t here</h1>
        <p className="t-body  mt-4 text-muted-foreground">
          Nothing on Talent4u answers to that address. If you followed a link to a job, the post may
          have been withdrawn by the employer or taken down in moderation — a job that simply closed
          keeps its page and says so at the top, so this is not one of those.
        </p>
        <p className="t-body  mt-3 text-muted-foreground">
          If the link came from a bookmark or a search result, it is probably just out of date.
          Start again from the job list — browsing and filtering work the same whether or not you
          are signed in.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" render={<Link href="/jobs">Browse jobs</Link>} />
          <Button size="lg" variant="outline" render={<Link href="/">Go to the home page</Link>} />
        </div>

        <section className="mt-12">
          <h2 className="t-label text-muted-foreground">Also on Talent4u</h2>
          {/* Rows sharing one hairline — the same atom the rest of the product
              uses, so a dead end still looks like the product. */}
          <ul className="rowset mt-3">
            {ONWARD.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="row-hover group flex items-center gap-4 px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold group-hover:underline">{item.title}</span>
                    <span className="t-body-dense mt-0.5 block text-muted-foreground">
                      {item.line}
                    </span>
                  </span>
                  <IconArrowRight className="text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
