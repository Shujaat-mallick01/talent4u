import { cn } from "@/lib/utils";

/**
 * Loading placeholder.
 *
 * BRANDGUIDE / CRM brief: "skeleton rows built from Mist blocks at 2px radius,
 * no shimmer sweep, a 900ms opacity pulse between 1.0 and 0.55". A sweeping
 * gradient is the generic choice and reads as decoration; a slow opacity pulse
 * reads as "waiting", which is what it is. prefers-reduced-motion cuts the
 * animation globally in globals.css and holds the end state.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-[t4u-pulse_900ms_ease-in-out_infinite] rounded-[2px] bg-muted", className)}
      {...props}
    />
  );
}

/**
 * A skeleton standing in for a list of record rows. Matches the real rowset's
 * hairlines and height so the page does not shift when content arrives.
 */
export function SkeletonRows({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("rowset", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-[42%]" />
            <Skeleton className="h-3 w-[28%]" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
