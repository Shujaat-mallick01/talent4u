export function StarRating({
  value,
  count,
  hideCount = false,
}: {
  value: number | null;
  count: number;
  /** Show the stars and number only, without the "(count)" suffix. */
  hideCount?: boolean;
}) {
  if (value === null || count === 0) {
    return <span className="text-sm text-muted-foreground">No reviews yet</span>;
  }
  const full = Math.round(value);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm"
      aria-label={`Rated ${value.toFixed(1)} out of 5${hideCount ? "" : ` from ${count} ${count === 1 ? "review" : "reviews"}`}`}
    >
      <span aria-hidden className="tracking-tight text-foreground">
        {"★".repeat(full)}
        <span className="text-muted-foreground/40">{"★".repeat(5 - full)}</span>
      </span>
      <span className="text-muted-foreground">
        {value.toFixed(1)}
        {hideCount ? "" : ` (${count})`}
      </span>
    </span>
  );
}
