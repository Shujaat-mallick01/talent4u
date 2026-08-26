"use client";

import { COUNTRIES } from "@/lib/geo/countries";

/**
 * The page a company will read, filling in as it is typed.
 *
 * The panel beside an onboarding question is usually decoration. This one
 * answers the question people are actually asking while they fill a form in —
 * "why does this matter, and what am I making?" — by being the thing they are
 * making. A headline written against a live preview is a better headline than
 * one written into an empty box, and nobody has to be told that the bio is
 * what a recruiter skims when they can see that it is.
 *
 * Deliberately not pixel-identical to /freelancers/[slug]: it is a preview at
 * card size, and promising an exact rendering it then does not deliver would
 * be worse than obviously being a summary.
 */
export function ProfilePreview({
  displayName,
  headline,
  bio,
  country,
  hourlyRateUsd,
  skills,
  isOpenToWork,
}: {
  displayName: string;
  headline: string;
  bio: string;
  country: string;
  hourlyRateUsd: string;
  skills: string[];
  isOpenToWork: boolean;
}) {
  const name = displayName.trim();
  const countryName = country ? (COUNTRIES.find((c) => c.code === country)?.name ?? null) : null;
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "—";
  const rate = hourlyRateUsd.trim() === "" ? null : Number(hourlyRateUsd);

  return (
    <div className="sticky top-24">
      <p className="t-label mb-3 text-muted-foreground">Your public profile</p>

      <div className="surface-card p-6">
        <div className="flex items-start gap-4">
          <span className="chip chip-lg t-data text-[15px] text-muted-foreground">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className={name ? "text-[17px] font-semibold" : "text-[17px] text-muted-foreground"}>
              {name || "Your name"}
            </p>
            <p
              className={
                headline.trim()
                  ? "mt-1 text-[15px] leading-[22px] text-muted-foreground"
                  : "mt-1 text-[15px] leading-[22px] text-muted-foreground/50"
              }
            >
              {headline.trim() || "Your headline — one line on what you do"}
            </p>
          </div>
        </div>

        {countryName || rate !== null || isOpenToWork ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            {countryName ? (
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {countryName}
              </span>
            ) : null}
            {rate !== null && Number.isFinite(rate) && rate > 0 ? (
              <span className="t-data text-[13px]">${rate.toLocaleString("en-US")}/hr</span>
            ) : null}
            {isOpenToWork ? (
              <span className="t-label text-success">Open to work</span>
            ) : null}
          </div>
        ) : null}

        {skills.length > 0 ? (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {skills.slice(0, 8).map((skill) => (
              <li
                key={skill}
                className="rounded-md bg-muted px-2.5 py-1 text-[13px] leading-[18px] text-muted-foreground"
              >
                {skill}
              </li>
            ))}
            {skills.length > 8 ? (
              <li className="px-1 py-1 text-[13px] leading-[18px] text-muted-foreground">
                +{skills.length - 8} more
              </li>
            ) : null}
          </ul>
        ) : null}

        {bio.trim() ? (
          <p className="mt-5 border-t border-border pt-5 text-[15px] leading-[22px] text-muted-foreground">
            {bio.trim().slice(0, 260)}
            {bio.trim().length > 260 ? "…" : ""}
          </p>
        ) : null}
      </div>

      <p className="measure mt-4 text-[13px] leading-[18px] text-muted-foreground">
        Browsing and applying never costs a commission. This page is what a company reads before
        deciding whether to reply — you can change any of it later.
      </p>
    </div>
  );
}
