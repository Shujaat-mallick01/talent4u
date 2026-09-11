import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { StarRating } from "@/components/profile/star-rating";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconExternal } from "@/components/ui/icon";
import { getPublicFreelancerBySlug } from "@/lib/db/freelancer";
import { countryName } from "@/lib/geo/countries";
import { freelancerVerificationBadge } from "@/lib/profile/badges";
import { freelancerPersonJsonLd, jsonLdScript } from "@/lib/profile/jsonld";
import { roundRating } from "@/lib/profile/reviews";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Public freelancer profile. SEO-critical and fully server-rendered.
 *
 * The layout answers, in order, the two questions a stranger arrives with:
 * what does this person do, and does anyone vouch for them. So the headline
 * sits in Ink directly under the name, the verification badge carries its
 * meaning in plain words beside it (a title attribute is invisible on touch),
 * and every fact a recruiter compares between candidates — rate, rating,
 * reviews, country, timezone, tenure — lands in one ruled panel of tabular
 * .t-data instead of a grey sentence.
 */

const canonical = (slug: string) => `${SITE_URL}/freelancers/${slug}`;

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const monthFmt = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** One cell of the ruled fact panel: mono label over a tabular value. */
function Fact({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="t-label text-muted-foreground">{label}</dt>
      <dd className={cn("t-data mt-1.5", muted && "text-muted-foreground")}>{value}</dd>
    </div>
  );
}

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
    { label: "GitHub", cta: "View their GitHub", href: profile.githubUrl },
    { label: "Portfolio", cta: "View their portfolio", href: profile.portfolioUrl },
    { label: "LinkedIn", cta: "View their LinkedIn", href: profile.linkedinUrl },
  ].filter((l): l is { label: string; cta: string; href: string } => Boolean(l.href));

  // Skills grouped by category so a long list reads as a few short lines
  // rather than one undifferentiated cloud of chips.
  const grouped = new Map<string, { slug: string; name: string; yearsExp: number | null }[]>();
  for (const s of profile.skills) {
    const key = s.skill.category?.name ?? "Other";
    const entry = { slug: s.skill.slug, name: s.skill.name, yearsExp: s.yearsExp };
    const existing = grouped.get(key);
    if (existing) existing.push(entry);
    else grouped.set(key, [entry]);
  }
  const skillGroups = [...grouped.entries()].sort(([a], [b]) =>
    a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b),
  );

  // Reviews are locked until both sides confirm an engagement, so an empty
  // list is a fact about the process, not a gap in the profile — say which.
  // The one action a reader can take is to read the linked work instead, so
  // the invitation only appears when there is something to open.
  const emptyGuidance =
    "A review only appears here after this freelancer and an employer both confirm they worked together, with the rate and duration stated — nobody can post a one-sided review." +
    (links.length > 0 ? " Until then, their linked work is the evidence to read." : "");

  return (
    <main id="main" className="flex-1">
      <script
        type="application/ld+json"
        // Escaped by jsonLdScript — safe against markup injection.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-10">
        <div className="w-full max-w-4xl">
        <header>
          {/* A stranger arrives from a search result with no idea who this is.
              The face is the first thing that makes the page a person rather
              than a record — round, because people are round here and
              companies get the 2px square. */}
          <div className="flex items-start gap-4">
            <Avatar
              name={profile.displayName}
              src={profile.avatarUrl}
              size="lg"
              shape="person"
            />
            <div className="min-w-0">
              <p className="t-label text-muted-foreground">Freelancer</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="t-display-2">{profile.displayName}</h1>
                {profile.isOpenToWork ? (
                  <ProfileBadge
                    spec={{
                      label: "Open to work",
                      tone: "green",
                      title: "This freelancer says they are available for new work.",
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* What they do, in Ink — the first thing the eye should land on
              after the name. */}
          <p className="t-subhead  mt-3">{profile.headline}</p>

          {/* The badge's meaning in plain words. A hover-only title attribute
              never reaches a touch reader. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ProfileBadge spec={badge} />
            <p className="t-body-dense  text-muted-foreground">{badge.title}</p>
          </div>
        </header>

        {/* The comparison panel: one hairline grid, every value tabular. */}
        <dl className="surface-card mt-6 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-6">
          <Fact
            label="Rate"
            value={
              profile.hourlyRateUsd
                ? `$${profile.hourlyRateUsd.toLocaleString("en-US")}/hr`
                : "Not listed"
            }
            muted={!profile.hourlyRateUsd}
          />
          <Fact
            label="Rating"
            value={rating === null ? "Not rated" : `${rating.toFixed(1)} / 5`}
            muted={rating === null}
          />
          <Fact
            label="Confirmed work"
            value={
              profile.confirmedEngagements === 0
                ? "None yet"
                : profile.confirmedEngagements === 1
                  ? "1 engagement"
                  : `${profile.confirmedEngagements} engagements`
            }
            muted={profile.confirmedEngagements === 0}
          />
          <Fact label="Reviews" value={String(reviewCount)} muted={reviewCount === 0} />
          <Fact label="Country" value={country} />
          <Fact label="Timezone" value={profile.timezone.replace(/_/g, " ")} />
          <Fact label="Member since" value={monthFmt.format(profile.createdAt)} />
        </dl>

        {links.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-[15px] font-medium transition-colors duration-[120ms] ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {l.label}
                  <IconExternal className="size-4 text-muted-foreground" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {profile.portfolio.length > 0 ? (
          <section className="mt-8 border-t border-border pt-8">
            <h2 className="t-label text-muted-foreground">Selected work</h2>
            {/* Two columns, not a dense grid: these are cases to read, not
                thumbnails to scan past. Above About on purpose — the work is
                what somebody came to look at, and burying it under a paragraph
                of prose is how a directory reads. */}
            <ul className="mt-4 grid gap-5 sm:grid-cols-2">
              {profile.portfolio.map((item) => (
                <li key={item.id} className="surface-card overflow-hidden">
                  {/* Fixed aspect so a column keeps one rhythm whatever people
                      upload. Lazy because most are below the fold and this is
                      an indexed page where LCP is the budget. */}
                  <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        Supabase Storage serves these from a bucket host that
                        next.config.ts does not whitelist for next/image. */}
                    <img
                      src={item.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="px-4 py-3.5">
                    <h3 className="font-semibold">{item.title}</h3>
                    {item.description ? (
                      <p className="t-body-dense mt-1 whitespace-pre-wrap text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                    {item.linkUrl ? (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        See it live
                        <IconExternal className="size-4 text-muted-foreground" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 border-t border-border pt-8">
          <h2 className="t-label text-muted-foreground">About</h2>
          <div className="t-body  mt-3 whitespace-pre-wrap">{profile.bio}</div>
        </section>

        {skillGroups.length > 0 ? (
          <section className="mt-8 border-t border-border pt-8">
            <h2 className="t-label text-muted-foreground">Skills</h2>
            <ul className="rowset mt-3">
              {skillGroups.map(([category, skills]) => (
                <li
                  key={category}
                  className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <span className="t-label shrink-0 text-muted-foreground sm:w-40">{category}</span>
                  <ul className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <li
                        key={s.slug}
                        className="inline-flex items-baseline gap-1.5 rounded-md border border-border px-2.5 py-1 text-[15px] leading-5"
                      >
                        {s.name}
                        {s.yearsExp ? (
                          <span className="tabular text-[13px] text-muted-foreground">
                            {s.yearsExp} {s.yearsExp === 1 ? "yr" : "yrs"}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="t-label text-muted-foreground">Reviews</h2>
            {reviewCount > 0 ? <StarRating value={rating} count={reviewCount} /> : null}
          </div>

          {reviewCount === 0 ? (
            <div className="mt-3">
              {links.length > 0 ? (
                <EmptyState
                  title="No reviews yet"
                  guidance={emptyGuidance}
                  action={
                    <Button
                      variant="outline"
                      render={
                        <a href={links[0].href} target="_blank" rel="noopener noreferrer nofollow">
                          {links[0].cta}
                        </a>
                      }
                    />
                  }
                />
              ) : (
                /* Same block without an invitation: with no linked work there
                   is nothing for a reader to open, and a button that goes
                   somewhere unrelated is worse than none. */
                <div className="border border-dashed border-border px-6 py-16">
                  <div className="measure">
                    <h3 className="t-heading">No reviews yet</h3>
                    <p className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
                      {emptyGuidance}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="t-body-dense  mt-3 text-muted-foreground">
                Every review below comes from an engagement both sides confirmed, with the rate and
                duration stated.
                {reviewCount > profile.reviewsReceived.length
                  ? ` Showing the ${profile.reviewsReceived.length} most recent of ${reviewCount}.`
                  : ""}
              </p>

              {/* Rows sharing one hairline — never cards floating with gaps. */}
              <ul className="rowset mt-3">
                {profile.reviewsReceived.map((review) => (
                  <li key={review.id} className="row-hover px-4 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <StarRating value={review.rating} count={1} hideCount />
                        {review.authorRecruiter &&
                        !review.authorRecruiter.isBanned &&
                        review.authorRecruiter.deactivatedAt === null ? (
                          <Link
                            href={`/companies/${review.authorRecruiter.slug}`}
                            className="rounded-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {review.authorRecruiter.companyName}
                          </Link>
                        ) : review.authorRecruiter?.isBanned ? (
                          /* Banning delists the employer but keeps the review
                             they wrote. Say so rather than showing a nameless
                             row. */
                          <Link
                            href="/removed-employers"
                            className="rounded-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            Removed employer
                          </Link>
                        ) : review.authorRecruiter ? (
                          /* Self-deactivated, not banned: the page is gone by
                             their own choice, which is published nowhere. */
                          <span className="text-muted-foreground">A company</span>
                        ) : null}
                      </div>
                      <span className="t-data shrink-0 text-muted-foreground">
                        {dateFmt.format(review.createdAt)}
                      </span>
                    </div>
                    <p className="t-body-dense  mt-2 whitespace-pre-wrap">{review.body}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        </div>
      </div>
    </main>
  );
}
