import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { ReportDialog } from "@/components/report/report-dialog";
import { StarRating } from "@/components/profile/star-rating";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconExternal } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";
import { getPublicRecruiterBySlug } from "@/lib/db/recruiter";
import { countryName } from "@/lib/geo/countries";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { companyOrganizationJsonLd, jsonLdScript } from "@/lib/profile/jsonld";
import { roundRating } from "@/lib/profile/reviews";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { resolveReportNotice } from "@/app/report/notices";

/**
 * Public company profile. SEO-critical and fully server-rendered. A banned
 * employer's page is delisted here and in generateMetadata — see
 * /removed-employers.
 *
 * The page is read by a freelancer deciding whether to trust this employer, so
 * the verification tier leads, with what the tier actually means spelled out
 * beside the badge (a title attribute is invisible on touch), and the facts
 * that back it — country, open roles, rating, review count, tenure — sit in one
 * ruled panel of tabular .t-data rather than a grey sentence.
 */

const canonical = (slug: string) => `${SITE_URL}/companies/${slug}`;

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const monthFmt = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** One cell of the ruled fact panel: mono label over a tabular value. */
function Fact({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="bg-background px-4 py-3">
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { slug } = await params;
  const company = await getPublicRecruiterBySlug(slug);
  // A banned company's page is delisted; do not render it here.
  if (!company || company.isBanned) notFound();

  // Reporting needs an account, and the outcome comes back as a validated code
  // on this URL — never as free text.
  const [{ notice }, session] = await Promise.all([searchParams, getSession()]);
  const reportNotice = resolveReportNotice(notice);

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
    { label: "Website", cta: "Visit their website", href: company.websiteUrl },
    { label: "LinkedIn", cta: "View their LinkedIn", href: company.linkedinUrl },
  ].filter((l): l is { label: string; cta: string; href: string } => Boolean(l.href));

  // Reviews are locked until both sides confirm an engagement, so an empty
  // list is a fact about the process, not a gap in the profile — say which.
  // The only action a reader can take from here is to go and read the
  // employer's own pages, so the invitation appears only when one is linked.
  const emptyGuidance =
    "A review only appears here after this employer and a freelancer both confirm they worked together, with the rate and duration stated — nobody can post a one-sided review." +
    (links.length > 0 ? " Until then, judge them on the verification tier and their own pages." : "");

  return (
    <main id="main" className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        {/* The report control is at the bottom of the page; its outcome is not,
            because a confirmation nobody scrolls back to is no confirmation. */}
        {reportNotice ? (
          <Notice tone={reportNotice.tone} className="mb-6">
            {reportNotice.message}
          </Notice>
        ) : null}

        <header>
          <div className="flex items-start gap-4">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public logo from Supabase Storage; next/image optimization is Phase 7.
              <img
                src={company.logoUrl}
                alt={`${company.companyName} logo`}
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-[2px] border border-border object-contain"
              />
            ) : (
              <div
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-[2px] border border-border bg-muted font-mono text-xl font-medium text-muted-foreground"
              >
                {company.companyName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="t-label text-muted-foreground">Employer</p>
              <h1 className="t-display-2 mt-2">{company.companyName}</h1>
              {company.companyDomain ? (
                <p className="t-data mt-2 text-muted-foreground">{company.companyDomain}</p>
              ) : null}
            </div>
          </div>

          {/* The tier is the first thing a freelancer needs, and its meaning
              travels with it — never softened, never hover-only. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ProfileBadge spec={tier} />
            <p className="t-body-dense measure text-muted-foreground">{tier.title}</p>
          </div>

          {company.tier === "UNVERIFIED" ? (
            <Notice tone="warning" className="mt-4">
              Never pay to apply, keep unpaid test work under 4 hours, and keep the conversation on
              Talent4u until you trust them.
            </Notice>
          ) : null}
        </header>

        {/* The trust panel: one hairline grid, every value tabular. */}
        <dl className="mt-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Status" value={tier.label} muted={company.tier === "UNVERIFIED"} />
          <Fact label="Open roles" value={String(activeJobs)} muted={activeJobs === 0} />
          <Fact
            label="Rating"
            value={rating === null ? "Not rated" : `${rating.toFixed(1)} / 5`}
            muted={rating === null}
          />
          <Fact label="Reviews" value={String(reviewCount)} muted={reviewCount === 0} />
          <Fact label="Country" value={country} />
          <Fact label="Listed since" value={monthFmt.format(company.createdAt)} />
        </dl>

        {links.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[2px] border border-border px-4 text-[15px] font-medium transition-colors duration-[120ms] ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {l.label}
                  <IconExternal className="size-4 text-muted-foreground" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {company.description ? (
          <section className="mt-8 border-t border-border pt-8">
            <h2 className="t-label text-muted-foreground">About</h2>
            <div className="t-body measure mt-3 whitespace-pre-wrap">{company.description}</div>
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
                /* Same block without an invitation: this employer has linked
                   nothing for a reader to open, and a button that goes
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
              <p className="t-body-dense measure mt-3 text-muted-foreground">
                Every review below comes from an engagement both sides confirmed, with the rate and
                duration stated.
                {reviewCount > company.reviewsReceived.length
                  ? ` Showing the ${company.reviewsReceived.length} most recent of ${reviewCount}.`
                  : ""}
              </p>

              {/* Rows sharing one hairline — never cards floating with gaps. */}
              <ul className="rowset mt-3">
                {company.reviewsReceived.map((review) => (
                  <li key={review.id} className="row-hover px-4 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <StarRating value={review.rating} count={1} hideCount />
                        {review.authorFreelancer && review.authorFreelancer.deactivatedAt === null ? (
                          <Link
                            href={`/freelancers/${review.authorFreelancer.slug}`}
                            className="rounded-[2px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {review.authorFreelancer.displayName}
                          </Link>
                        ) : review.authorFreelancer ? (
                          /* The author took their public page down. The review
                             stands — it is shared history — but their name no
                             longer renders or links anywhere. */
                          <span className="text-muted-foreground">A freelancer</span>
                        ) : null}
                      </div>
                      <span className="t-data shrink-0 text-muted-foreground">
                        {dateFmt.format(review.createdAt)}
                      </span>
                    </div>
                    <p className="t-body-dense measure mt-2 whitespace-pre-wrap">{review.body}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Not every scam is in a single post. A company using someone else's
            name, or asking for a deposit over email after the ad came down, is
            reported here rather than nowhere. */}
        <div className="mt-10">
          <ReportDialog
            targetType="company"
            targetId={company.id}
            slug={company.slug}
            signedIn={session !== null}
          />
        </div>
      </div>
    </main>
  );
}
