import Link from "next/link";

import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
        <div>
          <Logo className="h-5 w-auto text-foreground" />
          <p className="mt-2">0% commission. You keep 100% of what you earn.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/jobs" className="hover:text-foreground">
            Browse jobs
          </Link>
          <Link href="/signup" className="hover:text-foreground">
            For freelancers
          </Link>
          <Link href="/signup" className="hover:text-foreground">
            For companies
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/removed-employers" className="hover:text-foreground">
            Removed employers
          </Link>
        </nav>
      </div>
    </footer>
  );
}
