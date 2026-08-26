"use client";

/* eslint-disable @next/next/no-img-element */

import { COUNTRIES } from "@/lib/geo/countries";

/**
 * The company page as it is being written.
 *
 * The same idea as ProfilePreview, with one addition that is not decoration:
 * the Unverified badge is on it from the first keystroke. CLAUDE.md requires
 * that label on every job card and job detail page, and a company that first
 * meets it on their own live post — after writing a role and pressing publish
 * — has every right to feel misled. Showing it here means the tier is a thing
 * they understood before they signed up, and the way to change it is the
 * obvious next thing to do.
 *
 * A plain <img> rather than next/image: the source is a blob: URL for a file
 * that has not been uploaded yet, which the image optimiser cannot fetch.
 */
export function CompanyPreview({
  companyName,
  description,
  country,
  websiteUrl,
  logoUrl,
}: {
  companyName: string;
  description: string;
  country: string;
  websiteUrl: string;
  logoUrl: string | null;
}) {
  const name = companyName.trim();
  const countryName = country ? (COUNTRIES.find((c) => c.code === country)?.name ?? null) : null;
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "—";
  const site = websiteUrl.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="sticky top-24">
      <p className="t-label mb-3 text-muted-foreground">Your company page</p>

      <div className="surface-card p-6">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="size-12 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <span className="chip chip-lg t-data text-[15px] text-muted-foreground">{initials}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className={name ? "text-[17px] font-semibold" : "text-[17px] text-muted-foreground"}>
              {name || "Your company"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* Every account starts here, and every post will say so. */}
              <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Unverified
              </span>
              {countryName ? (
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {countryName}
                </span>
              ) : null}
              {site ? (
                <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                  {site}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {description.trim() ? (
          <p className="mt-5 border-t border-border pt-5 text-[15px] leading-[22px] text-muted-foreground">
            {description.trim().slice(0, 260)}
            {description.trim().length > 260 ? "…" : ""}
          </p>
        ) : null}
      </div>

      <p className=" mt-4 text-[13px] leading-[18px] text-muted-foreground">
        Unverified means one live role at a time, an “Unverified” label on it, and no starting
        conversations. Verifying lifts all three — and freelancers do check.
      </p>
    </div>
  );
}
