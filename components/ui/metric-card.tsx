import Link from "next/link";

import { cn } from "@/lib/utils";
import type { IconProps } from "./icon";

/**
 * The metric tile: a chip, a label, one number.
 *
 * BRANDGUIDE volume two. Volume one had no such thing — a figure was a
 * `.t-data` span next to a `.t-label`, sitting on the page with nothing around
 * it. That is readable and it is also invisible: the numbers a person opens
 * their dashboard to check had no more visual weight than the caption
 * explaining them.
 *
 * Rules this component exists to enforce, so no page has to remember them:
 *
 *   - The number is the biggest thing in the tile. Label above it in Slate,
 *     supporting sentence below in 13px. Never the other way round.
 *   - Chips are NEUTRAL. `tone="signal"` paints one red, and is for the tile
 *     that is asking to be acted on — at most one per screen. The prop is
 *     named for the meaning, not the colour, so nobody reaches for it because
 *     red looked nice.
 *   - A tile only lifts on hover if it is a link. Movement promises a
 *     destination; a tile that merely reports a number must sit still.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone = "neutral",
  href,
  className,
}: {
  icon: (props: IconProps) => React.ReactElement;
  /** Short, in Slate. "Applications", not "Total applications sent". */
  label: string;
  /** The figure itself. A string so "12 of 30" and "—" are both allowed. */
  value: React.ReactNode;
  /** One supporting line. Omit rather than pad. */
  note?: React.ReactNode;
  /** "signal" paints the chip red. At most one per screen — see above. */
  tone?: "neutral" | "signal";
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className={cn("chip", tone === "signal" && "chip-signal")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="t-label block text-muted-foreground">{label}</span>
        <span className="t-data mt-1.5 block text-[28px] leading-none text-foreground">
          {value}
        </span>
        {note ? (
          <span className="mt-2 block text-[13px] leading-[18px] text-muted-foreground">
            {note}
          </span>
        ) : null}
      </span>
    </>
  );

  const shell = cn("surface-card flex items-start gap-4 p-5", className);

  if (!href) {
    return <div className={shell}>{body}</div>;
  }
  return (
    <Link
      href={href}
      className={cn(
        shell,
        "surface-card-interactive",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </Link>
  );
}

/**
 * The row metric tiles live in. Four across on a wide screen, two on a tablet,
 * one on a phone — the same breakpoints everywhere so two dashboards never
 * disagree about what a metric row looks like.
 */
export function MetricRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
  );
}
