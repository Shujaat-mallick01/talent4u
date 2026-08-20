/** Average rating rounded to one decimal, or null when there are no ratings. */
export function averageRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((a, b) => a + b, 0);
  return roundRating(sum / ratings.length);
}

/** Rounds a precomputed average (e.g. a DB aggregate) to one decimal. */
export function roundRating(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(value * 10) / 10;
}
