"use client";

import Link from "next/link";

import { Orbit } from "@/components/brand/orbit";
import { Button } from "@/components/ui/button";

/**
 * The route error boundary for everything below the root layout.
 *
 * Client component because `reset` is a callback — that is the one reason this
 * file is not a Server Component.
 *
 * `error.message` is deliberately never rendered. In production Next replaces
 * it with a generic string anyway, but in any environment where it survives it
 * can carry a query, a column name or a stack frame, and none of that is the
 * reader's problem. `error.digest` is safe: it is a hash Next also writes to
 * the server log, so quoting it back to us actually finds the request.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        <div className="flex items-center gap-3">
          <Orbit className="size-7 text-primary" />
          <p className="t-label text-muted-foreground">Error · page did not load</p>
        </div>

        <h1 className="t-display-2 mt-6">This page stopped partway through</h1>
        <p className="t-body  mt-4 text-muted-foreground">
          The failure is on our side, not on your connection and not on anything you typed. Nothing
          you had already saved has changed.
        </p>
        <p className="t-body  mt-3 text-muted-foreground">
          Try loading it again — most of these clear on the second attempt. If it fails twice, wait
          a minute and come back, or carry on from the job list in the meantime.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" onClick={() => reset()}>
            Try again
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/jobs">Browse jobs</Link>} />
          <Button size="lg" variant="ghost" render={<Link href="/">Go to the home page</Link>} />
        </div>

        {error.digest ? (
          <p className="mt-12 border-t border-border pt-4">
            <span className="t-label text-muted-foreground">Reference</span>{" "}
            <span className="t-data ml-1">{error.digest}</span>
            <span className="t-body-dense mt-1 block text-muted-foreground">
              Quote this if you write to us — it points at the exact request that failed.
            </span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
