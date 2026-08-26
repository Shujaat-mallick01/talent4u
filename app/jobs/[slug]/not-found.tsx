import Link from "next/link";

import { Orbit } from "@/components/brand/orbit";
import { Button } from "@/components/ui/button";
import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";

/**
 * The job-shaped 404, for every `notFound()` thrown by the job detail page.
 *
 * A generic "page not found" is wrong here, because three quite different
 * things land a reader on this URL and only one of them is a broken link. The
 * page names all three, in the order they actually happen, so a freelancer who
 * hit the early-access window learns something rather than assuming the post
 * was a scam that got pulled.
 *
 * The 6-hour figure is read from the pricing config, never typed in — the same
 * constant the browse query filters on.
 *
 * Metadata is deliberately not exported: the route's own generateMetadata
 * already returns "Job not found" with robots noindex for this case, and it
 * stays the single source of that behaviour.
 */

const REASONS = [
  {
    title: `It was posted less than ${EARLY_ACCESS_HOURS} hours ago`,
    body: `New posts go to Pro members first, for ${EARLY_ACCESS_HOURS} hours. If this one has just gone up, it will appear on browse when that window ends — no action needed.`,
  },
  {
    title: "The employer withdrew it",
    body: "A post pulled back to draft, or held while we check it, has no public page until it is published again. A job that merely closed keeps its page and says so at the top, so this is not that.",
  },
  {
    title: "We removed the company",
    body: "Removing an employer takes their posts down with them. Every removal is published with its reason.",
  },
] as const;

export default function JobNotFound() {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        <div className="flex items-center gap-3">
          <Orbit className="size-7 text-primary" />
          <p className="t-label text-muted-foreground">404 · job not available</p>
        </div>

        <h1 className="t-display-2 mt-6">This job has no public page</h1>
        <p className="t-body  mt-4 text-muted-foreground">
          The link was valid at some point, or it was never yours to see yet. Three things put a job
          here:
        </p>

        <h2 className="sr-only">Why a job stops showing</h2>
        <ul className="rowset mt-6">
          {REASONS.map((reason) => (
            <li key={reason.title} className="px-4 py-3.5">
              <h3 className="font-semibold">{reason.title}</h3>
              <p className="t-body-dense  mt-1 text-muted-foreground">{reason.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" render={<Link href="/jobs">Browse jobs</Link>} />
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/removed-employers">See removed employers</Link>}
          />
        </div>
      </div>
    </main>
  );
}
