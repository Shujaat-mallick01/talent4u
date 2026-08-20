/**
 * The site's absolute base URL, for canonical links, OpenGraph, and JSON-LD.
 *
 * Resolved once here so the SEO surfaces never silently bake in a wrong value:
 * a trailing slash is trimmed (so canonicals never get a double slash), and a
 * missing var in production fails loudly instead of shipping localhost URLs
 * that search engines would treat as the canonical.
 */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_SITE_URL must be set in production.");
    }
    return "http://localhost:3000";
  }
  return raw.replace(/\/+$/, "");
}

export const SITE_URL = resolveSiteUrl();
