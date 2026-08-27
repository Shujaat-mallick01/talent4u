import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MetricCard, MetricRow } from "@/components/ui/metric-card";
import { IconBriefcase, IconBuilding, IconMessage, IconUser } from "@/components/ui/icon";
import { requireRole } from "@/lib/auth/guards";
import { getMetricsForUser } from "@/lib/services/metrics";

export const metadata: Metadata = {
  title: "Metrics",
  robots: { index: false, follow: false },
};

/**
 * Whether the marketplace works.
 *
 * Three ratios, and deliberately nothing else. BUILD_PLAN: "Ignore vanity
 * metrics — do not build a signups counter." Signups measure how well we
 * market; these measure whether the two sides actually meet, which is the only
 * question that decides whether any of the rest was worth building.
 *
 * Every number shows its denominator next to it, and every one says what it
 * does NOT mean. A dashboard read once a week by the person who built the
 * thing is exactly where motivated reasoning goes to work, so the caveats are
 * on the screen rather than in a document nobody opens.
 */
export default async function MetricsPage() {
  const { user } = await requireRole("ADMIN");
  const result = await getMetricsForUser(user.id);
  if (!result.ok) redirect("/dashboard");

  const { measures, scale } = result.view;

  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <header className="mb-8">
          <h1 className="t-display-2">Does this work?</h1>
          <p className="measure mt-3 text-[16px] leading-[26px] text-muted-foreground">
            Three questions, each answered as a share of the people who have had a fair chance to
            answer it. There is no signups number here on purpose — signups measure marketing, and
            marketing is not the thing that can fail quietly.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          {measures.map((m) => (
            <section key={m.key} className="surface-card flex flex-col p-6">
              <h2 className="t-subhead">{m.question}</h2>

              <p className="mt-5 flex items-baseline gap-2.5">
                {m.percent === null ? (
                  <span className="t-data text-[32px] leading-none text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className="t-data tabular text-[44px] leading-none">{m.percent}%</span>
                    <span className="t-data tabular text-[15px] text-muted-foreground">
                      {m.hit}/{m.total}
                    </span>
                  </>
                )}
              </p>

              {m.percent === null ? (
                // Not the same as 0%. Nobody has failed; nobody has had the
                // window yet, and showing a zero here would be a lie that
                // happens to look like data.
                <p className="mt-3 text-[15px] leading-[22px] text-muted-foreground">
                  Nothing has had long enough to count yet.
                </p>
              ) : null}

              <div className="mt-auto pt-6">
                <p className="t-label text-muted-foreground">Out of</p>
                <p className="mt-1.5 text-[14px] leading-[20px] text-muted-foreground">
                  {m.denominator}
                </p>

                <p className="t-label mt-4 text-muted-foreground">What it does not say</p>
                <p className="mt-1.5 text-[14px] leading-[20px] text-muted-foreground">
                  {m.caveat}
                </p>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-10" aria-labelledby="scale-heading">
          <h2 id="scale-heading" className="t-subhead">
            How much is behind those percentages
          </h2>
          <p className="measure mt-2 text-[15px] leading-[22px] text-muted-foreground">
            A share of five is not a share of five hundred. These are here so the numbers above get
            read with the right amount of confidence.
          </p>

          <MetricRow className="mt-5">
            <MetricCard
              icon={IconBriefcase}
              label="Jobs published"
              value={scale.publishedJobs}
              note="Ever, including closed"
            />
            <MetricCard
              icon={IconMessage}
              label="Applications"
              value={scale.applications}
              note="Ever sent"
            />
            <MetricCard
              icon={IconBuilding}
              label="Companies posting"
              value={scale.companiesWhoPosted}
              note="Published at least one role"
            />
            <MetricCard
              icon={IconUser}
              label="Freelancers applying"
              value={scale.freelancersWhoApplied}
              note="Sent at least one application"
            />
          </MetricRow>
        </section>
      </div>
    </main>
  );
}
