import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/**
 * The moderation queue, waiting.
 *
 * Inside the admin shell, so the rail and its queue counts stay on screen —
 * an admin can still see how much work is waiting while the rows resolve.
 * Header, section heading and rows sit at the same `px-6 py-8 lg:px-8` inset
 * the queue itself uses.
 */
export default function AdminLoading() {
  return (
    <main id="main" className="flex-1">
      <div className="w-full px-6 py-8 lg:px-8">
        <div className="mb-6 pb-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-3 w-80 max-w-full" />
        </div>
        <Skeleton className="mb-3 h-4 w-28" />
        <SkeletonRows rows={6} />
      </div>
    </main>
  );
}
