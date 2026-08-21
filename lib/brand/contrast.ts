/**
 * WCAG contrast maths, and the brand palette expressed as data.
 *
 * The brand guide states specific ratios ("Ink at 19.28:1", "White on Signal
 * Red clears 4.73:1 and is used only at 15px 600 weight and above"). Those
 * numbers are load-bearing — they are what makes the palette usable — so they
 * are checked by a test rather than trusted from a PDF.
 */

export const BRAND = {
  signalRed: "#E51315",
  deepRed: "#A80E10",
  ember: "#FF6B6D",
  ink: "#0E0E10",
  graphite: "#3A3A40",
  slate: "#585860",
  line: "#E2E2E5",
  mist: "#F4F4F5",
  paper: "#FFFFFF",
  success: "#0B7A4B",
  warning: "#8A5200",
  info: "#1B4FD1",
} as const;

export type BrandColor = keyof typeof BRAND;

const channel = (hex: string, i: number): number =>
  parseInt(hex.replace("#", "").slice(i * 2, i * 2 + 2), 16) / 255;

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((i) => {
    const c = channel(hex, i);
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded the way the brand guide quotes them. */
export const ratio = (a: string, b: string): number => Math.round(contrast(a, b) * 100) / 100;

export type TextSize = "normal" | "large";

/**
 * WCAG 2.2. "Large" is 18.66px bold or 24px regular and up; everything else
 * is normal text. AAA is the bar the brand guide sets for body and metadata
 * ("clear 7:1 against Paper"), which is stricter than AA.
 */
export const MINIMUMS = {
  AA: { normal: 4.5, large: 3 },
  AAA: { normal: 7, large: 4.5 },
} as const;

export function meets(
  fg: string,
  bg: string,
  level: keyof typeof MINIMUMS = "AA",
  size: TextSize = "normal",
): boolean {
  return contrast(fg, bg) >= MINIMUMS[level][size];
}

/** Non-text contrast (borders, focus rings, icons) needs 3:1 under WCAG 2.2. */
export const NON_TEXT_MINIMUM = 3;

export function meetsNonText(fg: string, bg: string): boolean {
  return contrast(fg, bg) >= NON_TEXT_MINIMUM;
}
