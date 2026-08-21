import { z } from "zod";

/**
 * Engagement input. CLAUDE.md: reviews unlock only once both parties confirm
 * they worked together "with stated rate and duration" — so both terms are
 * REQUIRED here even though the columns are nullable (the schema predates this
 * rule and older rows may lack them).
 *
 * Note what is NOT in these schemas: freelancerId, recruiterId, and jobId. The
 * proposer names an application they are already a party to, and the service
 * derives all three from it server-side. A client that could name the parties
 * could file a claim between two people it has nothing to do with.
 */

const statedRateUsd = z
  .number({ error: "Enter the agreed rate in whole dollars." })
  .int("Enter the rate in whole dollars.")
  .positive("The rate must be greater than zero.")
  .max(100000, "That rate looks too high — enter the agreed rate in US dollars.");

const durationWeeks = z
  .number({ error: "Enter how many weeks the work ran." })
  .int("Enter whole weeks.")
  .positive("The duration must be at least one week.")
  // 10 years. Past this it is almost certainly a typo (a day count, a year).
  .max(520, "Enter the duration in weeks — that looks like a typo.");

/** Both parties see and confirm these exact terms, so they are stated once. */
export const engagementTermsSchema = z.object({ statedRateUsd, durationWeeks });

/** Proposing: the application the two parties already share, plus the terms. */
export const proposeEngagementSchema = engagementTermsSchema.extend({
  applicationId: z.string().min(1),
});

export type EngagementTermsInput = z.infer<typeof engagementTermsSchema>;
export type ProposeEngagementInput = z.infer<typeof proposeEngagementSchema>;

/**
 * A rate is stated per the job's engagement type, which we do not carry on the
 * Engagement row — so label it the way both parties will read it, and never
 * imply an hourly figure we were not given.
 */
export const formatStatedRate = (usd: number): string => `$${usd.toLocaleString("en-US")}`;

export const formatDuration = (weeks: number): string =>
  weeks === 1 ? "1 week" : `${weeks} weeks`;
