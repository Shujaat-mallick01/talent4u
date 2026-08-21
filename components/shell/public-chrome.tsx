import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * The header and footer every public page shares: marketing, job browse and
 * detail, freelancer and company profiles, and the removals page.
 *
 * A component rather than a route-group layout because CLAUDE.md's directory
 * layout keeps jobs/ and freelancers/ at the top level, outside (marketing) —
 * so several sibling layouts need the same chrome.
 */
export function PublicChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
