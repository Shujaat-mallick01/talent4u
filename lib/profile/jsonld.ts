/**
 * schema.org JSON-LD builders for the public profile pages. Pure functions
 * returning plain objects; the page serializes them with `jsonLdScript` below,
 * which escapes "<" so the payload can never break out of the <script> tag.
 */

type Nullable<T> = T | null | undefined;

const compact = <T extends Record<string, unknown>>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
};

const aggregateRating = (average: Nullable<number>, count: number) =>
  average !== null && average !== undefined && count > 0
    ? { "@type": "AggregateRating", ratingValue: average, reviewCount: count }
    : undefined;

export type FreelancerJsonLdInput = {
  displayName: string;
  headline: string;
  bio: string;
  country: string;
  url: string;
  skills: string[];
  sameAs: Nullable<string>[];
  ratingAverage: Nullable<number>;
  ratingCount: number;
};

export function freelancerPersonJsonLd(input: FreelancerJsonLdInput): Record<string, unknown> {
  return compact({
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.displayName,
    jobTitle: input.headline,
    description: input.bio,
    url: input.url,
    address: { "@type": "PostalAddress", addressCountry: input.country },
    knowsAbout: input.skills,
    sameAs: input.sameAs.filter((s): s is string => Boolean(s)),
    aggregateRating: aggregateRating(input.ratingAverage, input.ratingCount),
  });
}

export type CompanyJsonLdInput = {
  companyName: string;
  description: Nullable<string>;
  country: string;
  url: string;
  websiteUrl: Nullable<string>;
  logoUrl: Nullable<string>;
  sameAs: Nullable<string>[];
  ratingAverage: Nullable<number>;
  ratingCount: number;
};

export function companyOrganizationJsonLd(input: CompanyJsonLdInput): Record<string, unknown> {
  return compact({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.companyName,
    description: input.description ?? undefined,
    url: input.websiteUrl ?? input.url,
    logo: input.logoUrl ?? undefined,
    address: { "@type": "PostalAddress", addressCountry: input.country },
    sameAs: input.sameAs.filter((s): s is string => Boolean(s)),
    aggregateRating: aggregateRating(input.ratingAverage, input.ratingCount),
  });
}

/**
 * Serializes JSON-LD for embedding in a <script type="application/ld+json">.
 * Escapes "<" and the U+2028/U+2029 line separators so the payload cannot
 * terminate the script element or inject markup.
 */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * An ItemList for a listing page.
 *
 * The detail pages already describe themselves — a JobPosting, a Person, an
 * Organization — but the LIST pages, which are the ones that rank for
 * "commission-free React jobs", said nothing about what they contained.
 * ItemList is what tells a crawler that this page is a set of N things and
 * where each of them lives, so the individual results can be surfaced from it.
 *
 * Deliberately URLs only, not embedded copies of each item. A summary here
 * that disagreed with the detail page it points at is a structured-data error
 * on both, and the crawler is going to fetch the real page anyway.
 */
export function itemListJsonLd(args: {
  name: string;
  urls: string[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: args.name,
    numberOfItems: args.urls.length,
    itemListElement: args.urls.map((url, i) => ({
      "@type": "ListItem",
      // 1-based: schema.org positions are ordinal, not indices.
      position: i + 1,
      url,
    })),
  };
}
