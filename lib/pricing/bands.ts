/**
 * Purchasing-power price bands, resolved by billing country.
 *
 * CLAUDE.md: "Prices are set per purchasing-power band, resolved by billing
 * country. Never hardcode USD amounts in components — read from `pricing`
 * config." This file decides WHICH band a country is in; prices.ts holds the
 * amounts.
 *
 * The grouping follows World Bank income classifications, which is a defensible
 * public basis rather than a guess. It is a plain data table on purpose — the
 * lists can be edited without touching any logic.
 *
 * Unmapped countries fall back to STANDARD, the list price. That direction is
 * deliberate: a country missing from these lists is far more likely to be a
 * high-income one we forgot than a low-income one, and quietly handing out the
 * deepest discount by default is the harder mistake to notice.
 */

export type PriceBand = "STANDARD" | "MID" | "LOW";

export const DEFAULT_BAND: PriceBand = "STANDARD";

export type BandSpec = {
  band: PriceBand;
  label: string;
  /** Shown on the pricing page when a reduced band applies. */
  note: string;
};

export const BAND_SPECS: Record<PriceBand, BandSpec> = {
  STANDARD: {
    band: "STANDARD",
    label: "Standard",
    note: "Standard pricing.",
  },
  MID: {
    band: "MID",
    label: "Regional",
    note: "Reduced for your country. Same features, no restrictions.",
  },
  LOW: {
    band: "LOW",
    label: "Regional",
    note: "Reduced for your country. Same features, no restrictions.",
  },
};

/**
 * Upper-middle income. Roughly 55–65% of the list price.
 */
const MID_COUNTRIES: readonly string[] = [
  "AL", "AM", "AR", "AZ", "BA", "BR", "BW", "BY", "CN", "CO", "CR", "CU", "DM",
  "DO", "EC", "FJ", "GA", "GD", "GE", "GQ", "GT", "ID", "IQ", "IR", "JM", "JO",
  "KZ", "LB", "LC", "LY", "MD", "ME", "MK", "MU", "MV", "MX", "MY", "NA", "PE",
  "PY", "RS", "RU", "SR", "SV", "TH", "TM", "TR", "VC", "VE", "XK", "ZA",
];

/**
 * Low and lower-middle income. Roughly 35–50% of the list price. This is the
 * band most of our early freelancer supply sits in, so it is the one that has
 * to be genuinely affordable rather than nominally discounted.
 */
const LOW_COUNTRIES: readonly string[] = [
  "AF", "AO", "BD", "BF", "BI", "BJ", "BO", "BT", "CD", "CF", "CG", "CI", "CM",
  "CV", "DJ", "DZ", "EG", "ER", "ET", "GH", "GM", "GN", "GW", "HN", "HT", "IN",
  "KE", "KG", "KH", "KM", "LA", "LK", "LR", "LS", "MA", "MG", "ML", "MM", "MN",
  "MR", "MW", "MZ", "NE", "NG", "NI", "NP", "PG", "PH", "PK", "RW", "SB", "SD",
  "SL", "SN", "SO", "SS", "SY", "SZ", "TD", "TG", "TJ", "TL", "TN", "TZ", "UA",
  "UG", "UZ", "VN", "VU", "WS", "YE", "ZM", "ZW",
];

const BAND_BY_COUNTRY: ReadonlyMap<string, PriceBand> = new Map([
  ...MID_COUNTRIES.map((code) => [code, "MID"] as const),
  ...LOW_COUNTRIES.map((code) => [code, "LOW"] as const),
]);

/**
 * The band for a billing country. A null/unknown/malformed country resolves to
 * STANDARD — we never guess a discount from an absent signal.
 */
export function bandForCountry(country: string | null | undefined): PriceBand {
  if (!country) return DEFAULT_BAND;
  return BAND_BY_COUNTRY.get(country.trim().toUpperCase()) ?? DEFAULT_BAND;
}

/** Every country we price below list, for the pricing page's own copy. */
export function isReducedBand(band: PriceBand): boolean {
  return band !== "STANDARD";
}
