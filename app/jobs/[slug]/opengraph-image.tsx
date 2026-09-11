import { ImageResponse } from "next/og";

import { getPublicJobBySlug } from "@/lib/db/job-browse";
import { decideJobVisibility } from "@/lib/jobs/jsonld";
import { earlyAccessCutoffFor } from "@/lib/pricing/plans";

/**
 * The card a shared job link shows.
 *
 * This is the one that earns its keep: a job link pasted into Slack, WhatsApp
 * or a group chat is how most freelancers will meet this product, and a link
 * with no card is a grey rectangle nobody clicks.
 *
 * It shows what somebody needs to decide whether to open it — the role, the
 * company, the budget — plus the tier label, because CLAUDE.md requires the
 * verification tier to be visible wherever a job is presented, and a preview
 * card in a group chat is exactly the kind of place a scam post would
 * otherwise look identical to a real one.
 *
 * Falls back to the site card for a slug that does not resolve, rather than
 * erroring: a 404 page still gets shared, and a broken image is worse than a
 * generic one.
 *
 * Visibility is decided here, not assumed. getPublicJobBySlug returns ANY job
 * by slug — its contract deliberately leaves status, the early-access window
 * and the recruiter's standing to the caller — so without the check below this
 * route would unfurl a full card for a DRAFT, for a post the safety scanner is
 * holding, for one a moderator removed, or for one still inside its Pro-only
 * window, every one of which 404s at /jobs/<slug>. A preview card is the
 * surface where that matters most: it is read by the people who never open the
 * link, and slugs are derived from titles, so they are guessable.
 *
 * The cutoff is the ANONYMOUS one, exactly as app/sitemap.ts uses, not the
 * requester's. This image is rendered into other people's chats, so the viewer
 * who matters is never the one who fetched it — and keeping the session out of
 * the route means a Pro-personalised card can never be cached and handed to a
 * stranger. The cost is that a Pro sharing an in-window job gets the generic
 * card for up to EARLY_ACCESS_HOURS, which is the right way round: the job is
 * Pro-only at that moment, and unfurling it in full would undercut the window
 * we sell.
 *
 * CLOSED still gets its card. That page renders as an archive rather than a
 * 404, and an archived role is a perfectly reasonable thing to share.
 */

export const runtime = "nodejs";
export const alt = "Job on Talent4u";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0E0E10";
const RED = "#E51315";
const SLATE = "#585860";
const LINE = "#E2E2E5";
const MIST = "#F4F4F5";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

function budgetLabel(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${usd(min)}–${usd(max)}`;
  if (min !== null) return `From ${usd(min)}`;
  if (max !== null) return `Up to ${usd(max)}`;
  return null;
}

const TIER_LABEL: Record<string, string> = {
  UNVERIFIED: "Unverified employer",
  VERIFIED: "Verified employer",
  TRUSTED: "Trusted employer",
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPublicJobBySlug(slug).catch(() => null);

  // The same pure decision the page makes, from the same row, so a card can
  // never advertise a job whose page 404s.
  const view = found
    ? decideJobVisibility(
        {
          status: found.status,
          publishedAt: found.publishedAt,
          recruiterBanned: found.recruiter.isBanned || found.recruiter.deactivatedAt !== null,
        },
        earlyAccessCutoffFor(null, new Date()),
      )
    : "not-found";
  const job = view === "not-found" ? null : found;

  const title = job?.title ?? "Commission-free work on Talent4u";
  const company = job?.recruiter.companyName ?? "Talent4u";
  const tier = job ? (TIER_LABEL[job.recruiter.tier] ?? "Unverified employer") : null;
  const budget = job ? budgetLabel(job.budgetMinUsd, job.budgetMaxUsd) : null;
  const remote = job?.isRemote ? "Remote" : (job?.location ?? null);

  // A long title has to shrink rather than overflow the card.
  const titleSize = title.length > 70 ? 52 : title.length > 45 ? 62 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FFFFFF",
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {[18, 13, 9, 6].map((d, i) => (
                <div key={i} style={{ width: d, height: d, borderRadius: d, background: RED }} />
              ))}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: INK, letterSpacing: -0.4 }}>
              TALENT4U
            </div>
          </div>
          {tier ? (
            <div
              style={{
                display: "flex",
                fontSize: 20,
                color: SLATE,
                background: MIST,
                padding: "10px 18px",
                borderRadius: 999,
              }}
            >
              {tier}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 28, color: SLATE, marginBottom: 18 }}>
            {company}
          </div>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 800,
              color: INK,
              letterSpacing: -1.8,
              lineHeight: 1.08,
              maxWidth: 1000,
              display: "flex",
            }}
          >
            {title.length > 110 ? `${title.slice(0, 110)}…` : title}
          </div>

          {budget || remote ? (
            <div style={{ display: "flex", gap: 20, marginTop: 30 }}>
              {budget ? (
                <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK }}>
                  {budget}
                </div>
              ) : null}
              {budget && remote ? (
                <div style={{ display: "flex", fontSize: 30, color: LINE }}>·</div>
              ) : null}
              {remote ? (
                <div style={{ display: "flex", fontSize: 30, color: SLATE }}>{remote}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${LINE}`,
            paddingTop: 26,
            fontSize: 23,
            color: SLATE,
          }}
        >
          <div style={{ display: "flex" }}>Apply free · you keep 100% of what you earn</div>
          <div style={{ display: "flex", color: RED, fontWeight: 700 }}>0% commission</div>
        </div>
      </div>
    ),
    size,
  );
}
