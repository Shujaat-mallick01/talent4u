import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StarRating } from "@/components/profile/star-rating";
import { getPublicFreelancerBySlug } from "@/lib/db/freelancer";
import { countryName } from "@/lib/geo/countries";
import { freelancerVerificationBadge } from "@/lib/profile/badges";
import { freelancerPersonJsonLd, jsonLdScript } from "@/lib/profile/jsonld";
import { roundRating } from "@/lib/profile/reviews";
import { SITE_URL } from "@/lib/site-url";

const canonical = (slug: string) => `${SITE_URL}/freelancers/${slug}`;

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicFreelancerBySlug(slug);
  if (!profile) return { title: "Freelancer not found" };

  const description = truncate(`${profile.headline}. ${profile.bio}`, 155);
  const url = canonical(slug);
  return {
    title: `${profile.displayName} — ${profile.headline}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title: `${profile.displayName} — ${profile.headline}`,
      description,
      url,
    },
    robots: { index: true, follow: true },
  };
}

export default async function FreelancerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicFreelancerBySlug(slug);
  if (!profile) notFound();

  const rating = roundRating(profile.reviewStats.average);
  const reviewCount = profile.reviewStats.count;
  const badge = freelancerVerificationBadge(profile.verification);
  const country = countryName(profile.country) ?? profile.country;

  const jsonLd = freelancerPersonJsonLd({
    displayName: profile.displayName,
    headline: profile.headline,
    bio: profile.bio,
    country: profile.country,
    url: canonical(slug),
    skills: profile.skills.map((s) => s.skill.name),
    sameAs: [profile.githubUrl, profile.portfolioUrl, profile.linkedinUrl],
    ratingAverage: rating,
    ratingCount: reviewCount,
  });

  const links = [
    { label: "GitHub", href: profile.githubUrl },
    { label: "Portfolio", href: profile.portfolioUrl },
    { label: "LinkedIn", href: profile.linkedinUrl },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href));

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        // Escaped by jsonLdScript — safe against markup injection.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="border-b border-border pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
            <ProfileBadge spec={badge} />
            {profile.isOpenToWork ? (
              <span className="inline-flex items-center rounded-[2px] border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-success">
                Open to work
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-lg text-muted-foreground">{profile.headline}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{country}</span>
            <span>{profile.timezone.replace(/_/g, " ")}</span>
            {profile.hourlyRateUsd ? (
              <span className="font-medium text-foreground">${profile.hourlyRateUsd}/hr</span>
            ) : null}
            <StarRating value={rating} count={reviewCount} />
          </div>

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

        <section className="py-6">
          <h2 className="sr-only">About</h2>
          <div className="space-y-3 whitespace-pre-wrap text-sm leading-relaxed">{profile.bio}</div>
        </section>

        {profile.skills.length > 0 ? (
          <section className="border-t border-border py-6">
            <h2 className="mb-3 text-sm font-semibold">Skills</h2>
            <ul className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <li
                  key={s.skill.slug}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm"
                >
                  {s.skill.name}
                  {s.yearsExp ? (
                    <span className="text-xs text-muted-foreground">
                      {s.yearsExp} {s.yearsExp === 1 ? "yr" : "yrs"}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
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
              {profile.reviewsReceived.map((review) => (
                <li key={review.id} className="rounded-lg border border-border p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <StarRating value={review.rating} count={1} hideCount />
                    {review.authorRecruiter && !review.authorRecruiter.isBanned ? (
                      <Link
                        href={`/companies/${review.authorRecruiter.slug}`}
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {review.authorRecruiter.companyName}
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
