import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getPublicStats } from "@/lib/db/stats";
import { SITE_URL } from "@/lib/site-url";

// Title comes from the root layout's title.default (identical string) —
// setting it here would run through the template and duplicate the brand.
export const metadata: Metadata = {
  description:
    "Post jobs and hire freelancers with 0% commission. Freelancers keep 100% of what they earn; companies pay a flat subscription, never a cut.",
  alternates: { canonical: SITE_URL },
};

const VALUE_PROPS = [
  {
    title: "0% commission, forever",
    body: "We never touch the money. Freelancers keep every dollar; companies pay a flat subscription instead of a 10–30% platform tax.",
  },
  {
    title: "Verified employers, labeled honestly",
    body: "Every job shows the employer's verification status — and unverified ones say so, prominently. Scam-pattern posts are held for human review before they ever go live.",
  },
  {
    title: "No lock-in, no middleman",
    body: "Exchange contact details freely and work however suits you both. Reviews unlock only when both sides confirm the work happened.",
  },
] as const;

const STEPS = [
  { n: "1", title: "Create a free profile", body: "Freelancers add skills and proof of work; companies add their domain and registration for verification." },
  { n: "2", title: "Post or apply", body: "Browsing is free and unlimited for everyone. Free freelancers get 12 applications per rolling 30 days; Pro is unlimited with 6-hour early access." },
  { n: "3", title: "Hire directly", body: "Talk, agree terms, and work together directly. Confirm the engagement afterwards to unlock mutual reviews." },
] as const;

export default async function LandingPage() {
  const { activeJobs, freelancers, companies } = await getPublicStats();

  return (
    <main id="main" className="flex-1">
      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            The commission-free hiring marketplace
          </p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Keep 100% of what you earn.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Companies post jobs for a flat subscription. Freelancers apply and get hired directly.
            Nobody takes a cut — ever.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" render={<Link href="/jobs">Browse {activeJobs} open jobs</Link>} />
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/signup">Post a job free</Link>}
            />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            {freelancers} freelancers · {companies} companies · in AI &amp; automation, full-stack
            development, and Shopify
          </p>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title} className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-base font-semibold">{prop.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{prop.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="relative rounded-lg border border-border p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.n}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Button size="lg" render={<Link href="/signup">Get started — it&apos;s free</Link>} />
          </div>
        </div>
      </section>
    </main>
  );
}
