import { z } from "zod";

/**
 * Optional-URL Zod helpers shared by the profile schemas.
 *
 * Empty/whitespace collapses to null ("not provided"). The host check guards
 * new URL() with URL.canParse so an unparseable value (e.g. a scheme-less
 * "github.com") returns a clean field error instead of throwing a TypeError
 * out of safeParse.
 */

/** An optional URL that, when present, must be HTTPS. */
export const optionalHttpsUrl = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine(
      (v) => v === null || (URL.canParse(v) && new URL(v).protocol === "https:"),
      message,
    );

/** An optional HTTPS URL constrained to `host` or a subdomain of it. */
export const optionalHostUrl = (host: string, message: string) =>
  optionalHttpsUrl(message).refine((v) => {
    if (v === null || !URL.canParse(v)) return true;
    const h = new URL(v).hostname.toLowerCase();
    return h === host || h.endsWith(`.${host}`);
  }, message);
