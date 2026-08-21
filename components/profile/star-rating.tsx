import { cn } from "@/lib/utils";

/**
 * A rating, for display.
 *
 * Drawn with the same star the rating INPUT uses (engagement-list.tsx) so the
 * read and write sides of a review match. It was a run of ★ text characters,
 * which the brand rules out twice over: "One family throughout: 1.5px stroke,
 * square cap, 24px grid" and "Never use emoji as an icon anywhere in product
 * or marketing." A text glyph also renders differently on every platform,
 * which is the specific thing a single icon family exists to prevent.
 *
 * The stars are decorative; the value and count are the accessible content.
 */

const STAR_PATH = "M12 3 14.3 8.8 20.6 9.2 15.7 13.2 17.3 19.3 12 15.9 6.7 19.3 8.3 13.2 3.4 9.2 9.7 8.8Z";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-4", filled ? "fill-current" : "fill-none text-muted-foreground/40")}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d={STAR_PATH} />
    </svg>
  );
}

export function StarRating({
  value,
  count,
  hideCount = false,
  className,
}: {
  value: number | null;
  count: number;
  /** Show the stars and number only, without the "(count)" suffix. */
  hideCount?: boolean;
  className?: string;
}) {
  if (value === null || count === 0) {
    return <span className={cn("text-[15px] text-muted-foreground", className)}>No reviews yet</span>;
  }

  const full = Math.round(value);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={`Rated ${value.toFixed(1)} out of 5${
        hideCount ? "" : ` from ${count} ${count === 1 ? "review" : "reviews"}`
      }`}
    >
      <span aria-hidden className="inline-flex text-foreground">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} filled={i <= full} />
        ))}
      </span>
      {/* Tabular so a column of ratings lines up down a page of profiles. */}
      <span aria-hidden className="t-data text-muted-foreground">
        {value.toFixed(1)}
        {hideCount ? "" : ` (${count})`}
      </span>
    </span>
  );
}
