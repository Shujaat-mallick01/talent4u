import type { Metadata } from "next";
import Link from "next/link";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import {
  FREELANCER_DIRECTORY_MAX_PAGE,
  listPublicFreelancers,
  parseDirectoryPage,
} from "@/lib/db/directory";
import { countryName } from "@/lib/geo/countries";
import { upsellLine } from "@/lib/pricing/catalogue";
import { freelancerVerificationBadge } from "@/lib/profile/badges";
import { getViewerBand } from "@/lib/services/entitlements";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * The public freelancer index. SEO-critical: profile pages are indexable, and
 * until this page existed nothing on the site linked to them, so a crawler had
 * no way to reach a single one.
 *
 * It is also where the paid wall becomes legible. CLAUDE.md: "Candidate search
 * is the paid wall." A free recruiter can read this list — everybody can, it is
 * public — but searching it, filtering it and writing to people is Growth. That
 * is said once, in plain words, at the top, with the price read from
 * lib/pricing at the viewer's own band rather than typed into this file.
 *
 * Fully server-rendered, works logged-out, no client JS.
 */

const DESCRIPTION =
  "Freelancers open to work on Talent4u — developers, designers and specialists you hire directly. 0% commission: they keep 100% of what they earn.";

const canonical = (page: number) =>
  page > 1 ? `${SITE_URL}/freelancers?page=${page}` : `${SITE_URL}/freelancers`;

const href = (page: number) => (page > 1 ? `/freelancers?page=${page}` : "/freelancers");

const LINK_FOCUS =
  "rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Column geometry, declared once so the header strip and rows cannot drift. */
const COL_PERSON = "min-w-[15rem] flex-1";
const COL_RATE = "md:w-28";
const COL_COUNTRY = "md:w-40";
const NUM_CELL = "flex items-baseline gap-2 md:block md:text-right";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const page = parseDirectoryPage((await searchParams).page);
  return {
    // The root layout's title template appends the brand.
    title: page > 1 ? `Freelancers — page ${page}` : "Freelancers",
    description: DESCRIPTION,
    // Self-referencing per page: pointing page 3 at page 1 would tell crawlers
    // the deep pages are duplicates and suppress the profiles listed on them,
    // which is the exact opposite of why this page exists.
    alternates: { canonical: canonical(page) },
    robots: { index: true, follow: true },
  };
}

export default async function FreelancersIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = parseDirectoryPage(params.page);

  const [{ profiles, hasMore }, band] = await Promise.all([
    listPublicFreelancers(page),
    // Quoted at the viewer's own band, never the list price. A logged-out
    // reader gets STANDARD, the honest default for an unknown country.
    getViewerBand(),
  ]);

  const growth = upsellLine("RECRUITER_GROWTH", band);
  const noun = profiles.length === 1 ? "person" : "people";
  const isLastAllowedPage = page >= FREELANCER_DIRECTORY_MAX_PAGE;

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="border-b border-border pb-6">
          <h1 className="t-display-2">Freelancers</h1>
          <p className="t-body measure mt-3 text-muted-foreground">
            Everyone below says they are open to work. You contact them, agree a rate between
            yourselves, and keep the whole of it — Talent4u takes 0% of what anyone earns and never
            handles the payment.
          </p>
        </header>

        {/* The paid wall, said once and said plainly. Reading this list is free
            for everyone, signed in or not; searching it is the product. */}
        <Notice tone="info" className="mt-6">
          This page lists everyone open to work, newest first. Searching and filtering candidates by
          skill, rate and country — and writing to them first — comes with {growth}.{" "}
          <Link href="/pricing" className={cn("font-medium underline", LINK_FOCUS)}>
            See what Growth includes
          </Link>
          .
        </Notice>

        <section aria-labelledby="results-heading" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-3">
            <div className="min-w-0">
              <h2 id="results-heading" className="t-subhead">
                Open to work
              </h2>
              <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
                Newest first
                {page > 1 ? ` · page ${page}` : ""}
              </p>
            </div>
            <p className="flex items-baseline gap-2">
              <span className="t-data">{profiles.length}</span>
              <span className="t-label text-muted-foreground">
                {page > 1 || hasMore ? `${noun} on this page` : `${noun} available`}
              </span>
            </p>
          </div>

          {profiles.length === 0 ? (
            page > 1 ? (
              <EmptyState
                className="mt-6"
                title="That is the end of the list"
                guidance="There is nobody after the last profile on the previous page. The newest profiles are back on page one."
                action={
                  <Button variant="outline" render={<Link href="/freelancers">Go to page one</Link>} />
                }
              />
            ) : (
              <EmptyState
                className="mt-6"
                title="Nobody is listed here yet"
                guidance="This page fills up as people put their profiles online. Put yours up and you are the first thing an employer reads — it takes a headline, a rate and one link to real work."
                action={<Button render={<Link href="/signup">Create a free profile</Link>} />}
              />
            )
          ) : (
            <>
              {/* Column captions sit above the rule so the rows below keep one
                  continuous hairline. Hidden from assistive tech because each
                  cell carries its own label. */}
              <div aria-hidden className="mt-6 hidden gap-x-6 px-4 pb-2 md:flex">
                <span className={cn("t-label text-muted-foreground", COL_PERSON)}>Specialist</span>
                <span className={cn("t-label text-right text-muted-foreground", COL_RATE)}>
                  Rate USD
                </span>
                <span className={cn("t-label text-right text-muted-foreground", COL_COUNTRY)}>
                  Country
                </span>
              </div>

              {/* Rows sharing one hairline, never cards floating with gaps. */}
              <ul className="rowset mt-6 md:mt-0">
                {profiles.map((profile) => {
                  const badge = freelancerVerificationBadge(profile.verification);
                  return (
                    <li key={profile.id} className="row-hover px-4 py-4">
                      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                        <div className={COL_PERSON}>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="text-[16px] font-semibold leading-[22px]">
                              <Link
                                href={`/freelancers/${profile.slug}`}
                                className={cn("hover:underline", LINK_FOCUS)}
                              >
                                {profile.displayName}
                              </Link>
                            </h3>
                            {/* Verification is never softened, here or anywhere. */}
                            <ProfileBadge spec={badge} />
                          </div>
                          <p className="mt-1 text-[15px] leading-[22px] text-muted-foreground">
                            {profile.headline}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 md:shrink-0">
                          <div className={cn(NUM_CELL, COL_RATE)}>
                            <span className="t-label text-muted-foreground md:sr-only">Rate</span>
                            {profile.hourlyRateUsd ? (
                              <span className="t-data whitespace-nowrap">
                                ${profile.hourlyRateUsd.toLocaleString("en-US")}/hr
                              </span>
                            ) : (
                              <span className="t-data text-muted-foreground">
                                <span aria-hidden>—</span>
                                <span className="sr-only">Rate not listed</span>
                              </span>
                            )}
                          </div>

                          <div className={cn(NUM_CELL, COL_COUNTRY)}>
                            <span className="t-label text-muted-foreground md:sr-only">Country</span>
                            <span className="t-data">
                              {countryName(profile.country) ?? profile.country}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {page > 1 || hasMore ? (
                <nav
                  aria-label="Freelancer list pages"
                  className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4"
                >
                  <p className="t-label text-muted-foreground">
                    {isLastAllowedPage
                      ? `Page ${page} is as deep as this list goes`
                      : `Page ${page}`}
                  </p>
                  <div className="flex items-center gap-2">
                    {page > 1 ? (
                      <Button
                        variant="ghost"
                        render={
                          <Link href={href(page - 1)}>
                            <IconArrowLeft />
                            Previous page
                          </Link>
                        }
                      />
                    ) : null}
                    {hasMore && !isLastAllowedPage ? (
                      <Button
                        variant="outline"
                        render={
                          <Link href={href(page + 1)}>
                            Next page
                            <IconArrowRight />
                          </Link>
                        }
                      />
                    ) : null}
                  </div>
                </nav>
              ) : null}
            </>
          )}
        </section>

        <footer className="mt-10 border-t border-border pt-6">
          <p className="t-body-dense measure text-muted-foreground">
            A badge says what we checked, not how good someone is. “Not verified” means we have not
            confirmed their identity yet — read their linked work, and remember that reviews here
            only appear once both sides confirm they worked together.{" "}
            <Link
              href="/signup"
              className={cn("underline hover:text-foreground", LINK_FOCUS)}
            >
              Are you a freelancer? Create a free profile and get listed here
            </Link>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
