import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/**
 * Browse-shaped placeholder: the same max-w-5xl page, the same
 * 240px filter column beside the results, the same header block. Holding the
 * grid means the filter form does not jump sideways when the real markup
 * lands — the usual failure of a centred spinner.
 *
 * Rendered inside the public chrome (app/jobs/layout.tsx), so the header and
 * footer stay put while this is on screen.
 */
export default function JobsLoading() {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-[var(--container-marketing)] px-6 py-10">
        <div className="mb-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-3 h-4 w-[26rem] max-w-full" />
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          {/* Filter column: five label-over-control pairs, then the button row. */}
          <div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="mb-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-10 w-full" />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>

          <SkeletonRows rows={8} />
        </div>
      </div>
    </main>
  );
}
