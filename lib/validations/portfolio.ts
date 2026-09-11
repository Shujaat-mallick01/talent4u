import { z } from "zod";

import { optionalHttpsUrl } from "./url";

/**
 * Portfolio item input.
 *
 * The cap lives here rather than in the service so the number has one home and
 * the copy can quote it. Twelve is enough for a real case and bounded enough
 * that a public profile stays fast and a public bucket cannot be used as free
 * image hosting.
 */
export const PORTFOLIO_MAX_ITEMS = 12;

export const PORTFOLIO_TITLE_MAX = 80;
export const PORTFOLIO_DESCRIPTION_MAX = 600;

export const portfolioItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give this work a title — three characters or more.")
    .max(PORTFOLIO_TITLE_MAX, `Keep the title under ${PORTFOLIO_TITLE_MAX} characters.`),
  description: z
    .string()
    .trim()
    .max(PORTFOLIO_DESCRIPTION_MAX, `Keep this under ${PORTFOLIO_DESCRIPTION_MAX} characters.`)
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  // https only, like every other link on a profile: an http link on an https
  // page is a mixed-content warning in the visitor's browser.
  linkUrl: optionalHttpsUrl("Use a full https:// link, or leave it blank."),
});

export type PortfolioItemInput = z.infer<typeof portfolioItemSchema>;

/**
 * Reordering. The client sends the ids in their new order; the server assigns
 * the positions. Sending positions from the client would let a caller write
 * arbitrary integers, and nothing downstream would notice.
 */
export const portfolioOrderSchema = z.object({
  ids: z
    .array(z.string().min(1).max(40))
    .min(1, "Nothing to reorder.")
    .max(PORTFOLIO_MAX_ITEMS, "That is more items than a profile can hold."),
});

export type PortfolioOrderInput = z.infer<typeof portfolioOrderSchema>;
