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
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-bold tracking-tight">Removed employers</h1>
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
            <div className="border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No employers have been removed yet. When one is, it will be listed here — with the
                reason, permanently.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {removed.length} {removed.length === 1 ? "company" : "companies"} removed
              </p>
              <ul className="divide-y divide-border border border-border">
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
            <Link href="/jobs" className="underline hover:text-foreground">
              Report it from the job post
            </Link>
            . We hold posts matching known scam patterns before they ever go live — never pay to
            apply, and never do long unpaid work for a stranger.
          </p>
        </footer>
      </div>
    </main>
  );
}
