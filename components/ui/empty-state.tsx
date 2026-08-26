import { cn } from "@/lib/utils";

/**
 * An empty screen.
 *
 * BRANDGUIDE voice: "An empty screen is an invitation, so it always contains
 * one action." And the CRM brief: left-aligned at the same inset as a row so
 * it does not float in the centre, with guidance that "must name the specific
 * filter to change" — not "No results found".
 *
 * `action` is required by the type, not optional, so an empty state without a
 * way out does not compile.
 */
export function EmptyState({
  title,
  guidance,
  action,
  className,
}: {
  title: string;
  /** One line. Names what to change, not what is absent. */
  guidance: string;
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed border-border bg-card px-6 py-16", className)}>
      <div className="measure">
        <h3 className="t-heading">{title}</h3>
        <p className="mt-2 text-[15px] leading-[22px] text-muted-foreground">{guidance}</p>
        <div className="mt-5">{action}</div>
      </div>
    </div>
  );
}
