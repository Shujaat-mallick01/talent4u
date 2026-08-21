import { z } from "zod";

/**
 * Review input. The client sends an engagement id, a rating, and a body —
 * never an author or a subject. Both of those are derived server-side from
 * which side of the engagement the caller is on, so a review cannot be
 * attributed to someone else or aimed at a third party.
 *
 * The database enforces the same things independently (rating BETWEEN 1 AND 5,
 * exactly one author, exactly one subject, author and subject on opposite
 * sides, both parties to THIS engagement, engagement confirmed).
 */

export const ratingSchema = z.coerce
  .number({ error: "Choose a rating from 1 to 5 stars." })
  .int("Choose a whole-star rating.")
  .min(1, "Choose a rating from 1 to 5 stars.")
  .max(5, "Choose a rating from 1 to 5 stars.");

export const writeReviewSchema = z.object({
  engagementId: z.string().min(1),
  rating: ratingSchema,
  body: z
    .string()
    .trim()
    // Reviews are the only reputation signal we have — we hold no payment data
    // to fall back on. A one-word review tells a reader nothing, so ask for a
    // real sentence rather than accepting "good".
    .min(40, "Say something useful — at least 40 characters. What was it like to work together?")
    .max(2000, "Keep it under 2,000 characters."),
});

export type WriteReviewInput = z.infer<typeof writeReviewSchema>;

export const RATING_LABELS: Record<number, string> = {
  1: "Would not work with again",
  2: "Below what was agreed",
  3: "Did what was agreed",
  4: "Good — would work with again",
  5: "Excellent",
};
