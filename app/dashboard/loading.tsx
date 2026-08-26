import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/**
 * The signed-in content area, waiting.
 *
 * This boundary sits inside the dashboard layout, so AppShell's rail, account
 * row and nav strip stay rendered and interactive — only the pane to the right
 * of the rule swaps out. It mirrors the standard dashboard header (title and
 * status line on the left, one action on the right) over a record set, at the
 * same `px-6 py-8 lg:px-8` inset every dashboard screen uses, so nothing
 * shifts when the real rows arrive.
 */
export default function DashboardLoading() {
  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 pb-4">
          <div>
            <Skeleton className="h-7 w-44" />
            <Skeleton className="mt-2 h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <SkeletonRows rows={6} />
      </div>
    </main>
  );
}
