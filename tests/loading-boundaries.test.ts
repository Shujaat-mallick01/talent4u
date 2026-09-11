import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A `loading.tsx` costs a route its 404 status.
 *
 * It creates a Suspense boundary, so the shell streams and HTTP 200 is
 * committed before the page component runs. `notFound()` after that renders the
 * right page under the wrong status — a soft 404. Google treats those as errors
 * it found by accident: it drops them from the index anyway and spends crawl
 * budget re-checking them, which is the opposite of what a product whose
 * distribution rests on indexable job and profile pages wants. `app/sitemap.ts`
 * goes to real trouble to keep soft-404s out of the sitemap; the pages
 * themselves were emitting them.
 *
 * Verified by experiment rather than reasoning: moving the two `loading.tsx`
 * files aside and rebuilding turned every one of these routes from 200 into
 * 404, and putting them back reverted it. Calling `notFound()` from
 * `generateMetadata` instead does NOT fix it — that was tried and measured.
 *
 * So the boundaries are scoped with route groups: `app/jobs/(index)/` keeps the
 * browse skeleton while leaving `/jobs/[slug]` outside any boundary, and the
 * root fallback moved into `(marketing)` and `(auth)`.
 *
 * This test is structural because the thing it protects is structural: a
 * `loading.tsx` added in the wrong place breaks the status of pages that still
 * look completely fine in a browser, and nothing else in the suite would
 * notice.
 */

const APP = join(process.cwd(), "app");

/**
 * Every directory from `app/` down to the route, inclusive — the segments Next
 * would search for a `loading.tsx` wrapping that route.
 */
function segmentsAbove(routeDir: string): string[] {
  const parts = routeDir.split("/").filter(Boolean);
  const dirs: string[] = [APP];
  let current = APP;
  for (const part of parts) {
    current = join(current, part);
    dirs.push(current);
  }
  return dirs;
}

/**
 * The public detail routes. Each one calls notFound() for a slug that does not
 * resolve, is hidden by the early-access window, was held by the safety
 * scanner, was removed by a moderator, or belongs to a banned employer — and
 * every one of those must answer 404, not 200.
 */
const PUBLIC_DETAIL_ROUTES = ["jobs/[slug]", "freelancers/[slug]", "companies/[slug]"];

describe("no Suspense boundary wraps a public detail route", () => {
  for (const route of PUBLIC_DETAIL_ROUTES) {
    it(`/${route} can still answer 404`, () => {
      // Only the route's own ancestor segments can wrap it. A loading.tsx in a
      // sibling route group wraps that group's children, never this route —
      // which is exactly what the fix relies on.
      const offenders = segmentsAbove(route)
        .filter((dir) => existsSync(join(dir, "loading.tsx")))
        .map((dir) => `${dir.replace(APP, "app")}/loading.tsx`);

      expect(
        offenders,
        `These wrap /${route} in a Suspense boundary, so notFound() there returns 200 ` +
          `instead of 404. Put the loading.tsx inside a route group that excludes the ` +
          `detail route — see app/jobs/(index)/.`,
      ).toEqual([]);
    });
  }

  it("keeps the skeletons that do not cost a status code", () => {
    // The fix scoped these rather than deleting them; if someone "cleans up"
    // the route groups, the skeletons go with them.
    for (const kept of [
      "(marketing)/loading.tsx",
      "(auth)/loading.tsx",
      "jobs/(index)/loading.tsx",
      "dashboard/loading.tsx",
      "admin/loading.tsx",
    ]) {
      expect(existsSync(join(APP, kept)), `app/${kept} is missing`).toBe(true);
    }
  });

  it("keeps the browse page inside the group that owns its skeleton", () => {
    expect(existsSync(join(APP, "jobs/(index)/page.tsx"))).toBe(true);
    // If this came back, /jobs/[slug] would be boundaried again.
    expect(existsSync(join(APP, "jobs/page.tsx"))).toBe(false);
    expect(existsSync(join(APP, "loading.tsx"))).toBe(false);
  });
});
