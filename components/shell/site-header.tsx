import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/route-guard";
import { getUserAuthState } from "@/lib/db/users";

import { signOut } from "@/app/(auth)/actions";

/**
 * Global navigation. Server component — auth state resolves server-side
 * (getSession is request-cached, so pages that also consult the session pay
 * no extra Auth round trip).
 */
export async function SiteHeader() {
  const session = await getSession();
  const account = session ? await getUserAuthState(session.userId) : null;

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-base font-bold tracking-tight">
            Talent<span className="text-muted-foreground">4u</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/jobs" className="text-muted-foreground hover:text-foreground">
              Browse jobs
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
