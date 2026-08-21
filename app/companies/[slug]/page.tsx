import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StarRating } from "@/components/profile/star-rating";
import { getPublicRecruiterBySlug } from "@/lib/db/recruiter";
import { countryName } from "@/lib/geo/countries";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { companyOrganizationJsonLd, jsonLdScript } from "@/lib/profile/jsonld";
import { roundRating } from "@/lib/profile/reviews";
import { SITE_URL } from "@/lib/site-url";

const canonical = (slug: string) => `${SITE_URL}/companies/${slug}`;

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await getPublicRecruiterBySlug(slug);
  // Banned companies are delisted (see /removed-employers) — never indexed.
  if (!company || company.isBanned) {
    return { title: "Company not found", robots: { index: false, follow: false } };
  }

  const tier = recruiterTierBadge(company.tier);
  const description = truncate(
    company.description ?? `${company.companyName} on Talent4u — ${tier.label} employer.`,
    155,
  );
  const url = canonical(slug);
  return {
    title: `${company.companyName} — ${tier.label} employer`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "profile", title: company.companyName, description, url },
    robots: { index: true, follow: true },
  };
}

export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await getPublicRecruiterBySlug(slug);
  // A banned company's page is delisted; do not render it here.
  if (!company || company.isBanned) notFound();

  const rating = roundRating(company.reviewStats.average);
  const reviewCount = company.reviewStats.count;
  const tier = recruiterTierBadge(company.tier);
  const country = countryName(company.country) ?? company.country;
  const activeJobs = company._count.jobs;

  const jsonLd = companyOrganizationJsonLd({
    companyName: company.companyName,
    description: company.description,
    country: company.country,
    url: canonical(slug),
    websiteUrl: company.websiteUrl,
    logoUrl: company.logoUrl,
    sameAs: [company.websiteUrl, company.linkedinUrl],
    ratingAverage: rating,
    ratingCount: reviewCount,
  });

  const links = [
    { label: "Website", href: company.websiteUrl },
    { label: "LinkedIn", href: company.linkedinUrl },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href));

  return (
    <main id="main" className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="border-b border-border pb-6">
          <div className="flex items-start gap-4">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public logo from Supabase Storage; next/image optimization is Phase 7.
              <img
                src={company.logoUrl}
                alt={`${company.companyName} logo`}
                width={56}
                height={56}
                className="size-14 rounded-md border border-border object-contain"
              />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-md border border-border bg-muted text-lg font-semibold text-muted-foreground">
                {company.companyName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{company.companyName}</h1>
                <ProfileBadge spec={tier} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{country}</span>
                {company.companyDomain ? <span>{company.companyDomain}</span> : null}
                <span>
                  {activeJobs} open {activeJobs === 1 ? "role" : "roles"}
                </span>
                <StarRating value={rating} count={reviewCount} />
              </div>
            </div>
          </div>

          {company.tier === "UNVERIFIED" ? (
            <p className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              This employer has verified their email only. Take the usual care before sharing
              personal details or doing unpaid work.
            </p>
          ) : null}

          {links.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ) : null}
        </header>

        {company.description ? (
          <section className="py-6">
            <h2 className="sr-only">About</h2>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{company.description}</div>
          </section>
        ) : null}

        <section className="border-t border-border py-6">
          <h2 className="mb-4 text-sm font-semibold">
            Reviews {reviewCount > 0 ? `(${reviewCount})` : ""}
          </h2>
          {reviewCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reviews yet. Reviews unlock only after both sides confirm they worked together.
            </p>
          ) : (
            <ul className="space-y-4">
              {company.reviewsReceived.map((review) => (
                <li key={review.id} className="rounded-lg border border-border p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <StarRating value={review.rating} count={1} hideCount />
                    {review.authorFreelancer ? (
                      <Link
                        href={`/freelancers/${review.authorFreelancer.slug}`}
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {review.authorFreelancer.displayName}
                      </Link>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{review.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
