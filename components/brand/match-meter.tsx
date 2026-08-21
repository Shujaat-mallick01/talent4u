import { cn } from "@/lib/utils";

/**
 * The Match Meter — this product's signature element.
 *
 * CRM brief: "an 88px column at the left of every result row holding eight
 * dots in a rising size run, filled Signal Red up to the candidate's match
 * score and pale grey after it, lifted straight from the logo's dotted orbit."
 *
 * The rising size run is the point: it is the logo's taper turned into a
 * scale, so the brand's one owned shape becomes the thing that reads a value.
 * A plain progress bar would carry the same number and none of the identity.
 *
 * Accessibility: the dots are decorative and aria-hidden; the score is exposed
 * as text, so a screen reader hears the value rather than eight circles.
 */

/** Eight dot diameters, 4px to 11px, matching the brief's run. */
const DIAMETERS = [4, 5, 6, 7, 8, 9, 10, 11] as const;

export function MatchMeter({
  /** 0–100. Values outside are clamped rather than trusted. */
  score,
  label = "Match",
  showValue = true,
  className,
}: {
  score: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  // How many of the eight dots are filled. A non-zero score always lights at
  // least one, so a 3% match never reads as an empty meter.
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * DIAMETERS.length));

  return (
    <div className={cn("flex w-[88px] shrink-0 flex-col items-start gap-1", className)}>
      <div className="flex h-[11px] items-end gap-[3px]" aria-hidden>
        {DIAMETERS.map((d, i) => (
          <span
            key={d}
            style={{ width: d, height: d }}
            className={cn("rounded-full", i < filled ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
      {showValue ? (
        <span className="t-label text-muted-foreground">
          <span className="sr-only">{label} </span>
          {clamped}%
        </span>
      ) : (
        <span className="sr-only">
          {label} {clamped}%
        </span>
      )}
    </div>
  );
}
