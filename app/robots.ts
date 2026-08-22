import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

/**
 * /robots.txt.
 *
 * Everything public is crawlable — job posts, freelancer profiles, company
 * pages and the legal pages are the distribution strategy, so nothing here
 * narrows them. The disallow list is only the surfaces that are either
 * private (a dashboard, the moderation queue), meaningless to a logged-out
 * crawler (onboarding), or not HTML at all (the API).
 *
 * These paths are prefixes, and every one of them is guarded server-side as
 * well. robots.txt is a request to well-behaved crawlers, never an
 * authorization boundary — assume curl ignores it, because it does.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/admin",
          "/onboarding",
          "/api",
          // The component state gallery. Real-looking pages, no real content.
          "/dev",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
