import type { Metadata } from "next";
import Link from "next/link";

import { ProfileBadge } from "@/components/profile/profile-badge";
import { listRemovedEmployers } from "@/lib/db/moderation";
import { countryName } from "@/lib/geo/countries";
import { recruiterTierBadge } from "@/lib/profile/badges";
import { SITE_URL } from "@/lib/site-url";

/**
 * Public transparency page. CLAUDE.md: "There is a public /removed-employers
 * page. Transparency here is a marketing asset." Fully public and indexable —
 * the point is that anyone can check what we removed and why.
 */

export const metadata: Metadata = {
  title: "Removed employers",
  description:
    "Every company removed from Talent4u, and why. We publish our moderation decisions because a hiring marketplace that hides them is asking you to take its word.",
  alternates: { canonical: `${SITE_URL}/removed-employers` },
  robots: { index: true, follow: true },
};

const dateFmt = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default async function RemovedEmployersPage() {
  const removed = await listRemovedEmployers();

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-10">
        <header className="pb-6">
          <h1 className="t-display-2">Removed employers</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Companies we have removed from Talent4u, with the reason. We publish this because a
            marketplace that moderates in private is asking you to take its word for it — and
            because knowing what gets a company removed tells you what to watch for.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Removal means their posts are gone and they cannot post again. It is not a court
            finding; it is our decision under the rules every company agrees to when they post.
            Company names are as the company entered them — the badge shows whether we ever
            verified that identity.
          </p>
        </header>

        <section className="py-6">
          {removed.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <p className="text-[15px] leading-[22px] text-muted-foreground">
                No employers have been removed yet. When one is, it will be listed here — with the
                reason, permanently.
              </p>
            </div>
          ) : (
            <>
              <p className="t-label mb-3 text-muted-foreground">
                {removed.length} {removed.length === 1 ? "company" : "companies"} removed
              </p>
              <ul className="rowset">
                {removed.map((company) => (
                  <li key={company.id} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{company.companyName}</h2>
                        {/* The name is self-asserted; say what we verified. */}
                        <ProfileBadge spec={recruiterTierBadge(company.tier)} />
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {countryName(company.country) ?? company.country}
                        {company.bannedAt ? ` · ${dateFmt.format(company.bannedAt)}` : ""}
                      </span>
                    </div>
                    {company.bannedReason ? (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {company.bannedReason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <p>
            Seen something that belongs here?{" "}
            <Link
              href="/jobs"
              className="rounded-xs underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Open the post
            </Link>{" "}
            and use “Report this post” at the bottom of it — or “Report this company” on the
            company&apos;s own page. It takes an account and one reason; a person reads every one,
            and we never tell the employer who reported them. We also hold posts matching known
            scam patterns before they ever go live — never pay to apply, and never do long unpaid
            work for a stranger.
          </p>
        </footer>
        </div>
    </main>
  );
}
