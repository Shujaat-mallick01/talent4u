import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/route-guard";
import { getUserAuthState } from "@/lib/db/users";

import { signOut } from "@/app/(auth)/actions";

import { Logo } from "./logo";

/**
 * Global navigation. Server component — auth state resolves server-side
 * (getSession is request-cached, so pages that also consult the session pay
 * no extra Auth round trip).
 */
export async function SiteHeader() {
  const session = await getSession();
  const account = session ? await getUserAuthState(session.userId) : null;

  return (
    <header className="border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 sticky top-0 z-40">
      <div className="mx-auto flex h-20 w-full max-w-[var(--container-marketing)] items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Talent4u home" className="flex items-center">
            <Logo className="w-[128px]" />
          </Link>
          <nav className="hidden items-center gap-5 text-[15px] sm:flex">
            <Link
              href="/jobs"
              className="rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Browse jobs
            </Link>
            <Link
              href="/pricing"
              className="rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Pricing
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {account ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                render={
                  <Link href={homeFor(account.role, account.hasProfile)}>Dashboard</Link>
                }
              />
              <form action={signOut}>
                <Button type="submit" size="sm" variant="outline">
                  Sign out
                </Button>
              </form>
            </>
          ) : session ? (
            <Button size="sm" render={<Link href="/onboarding">Finish signing up</Link>} />
          ) : (
            <>
              <Button size="sm" variant="ghost" render={<Link href="/signin">Sign in</Link>} />
              <Button size="sm" render={<Link href="/signup">Sign up free</Link>} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
