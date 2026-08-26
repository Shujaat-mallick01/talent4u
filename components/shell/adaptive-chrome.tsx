import { AppShell } from "./app-shell";
import { PublicChrome } from "./public-chrome";
import { buildShellNav } from "./shell-nav";

/**
 * Public pages, framed by whoever is looking at them.
 *
 * Browsing jobs is the thing this product is for, and CLAUDE.md makes it
 * permanently public — the same URL for a stranger, a search engine and a
 * signed-in freelancer. But the FRAME around it should not be the same for
 * all three. Until now it was: clicking "Browse jobs" in the product rail
 * threw you out onto the marketing site, complete with a footer inviting you
 * to sign up for the account you were already signed into, and no way back to
 * your applications except the browser's back button.
 *
 * So the page is identical and the chrome adapts. Signed in with a finished
 * profile, you keep the rail and stay inside the product. Signed out — which
 * includes every crawler — you get the marketing header and footer, and the
 * indexed HTML of the page itself is unchanged either way.
 *
 * Safe for SEO precisely because it changes no content: only the navigation
 * wrapped around it. Every route using this was already dynamically rendered,
 * so reading the session costs nothing that was not already being paid.
 */
export async function AdaptiveChrome({ children }: { children: React.ReactNode }) {
  const nav = await buildShellNav();

  // Signed out, mid-onboarding, or an admin: none of them has a product rail,
  // and all of them should still be able to read the page.
  if (!nav) return <PublicChrome>{children}</PublicChrome>;

  return (
    <AppShell groups={nav.groups} account={nav.account}>
      {children}
    </AppShell>
  );
}
