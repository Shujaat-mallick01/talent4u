import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/**
 * The fallback for any route that has not declared a closer one — marketing,
 * pricing, profiles, onboarding. Deliberately generic: a page header over a
 * block of records, which is the shape almost every screen here resolves into.
 *
 * The header blocks are decorative (Skeleton sets aria-hidden); SkeletonRows
 * carries the single announced status region, so a screen reader hears
 * "Loading" once rather than once per block.
 */
export default function Loading() {
  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="border-b border-border pb-6">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
        </div>
        <SkeletonRows rows={6} className="mt-6" />
      </div>
    </main>
  );
}
