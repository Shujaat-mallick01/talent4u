import { describe, expect, it } from "vitest";

import { BRAND, contrast, meets, meetsNonText, ratio } from "./contrast";

/**
 * The brand guide quotes exact contrast ratios and builds rules on top of them
 * ("white on Signal Red is used only at 15px 600 weight and above", "on Ink
 * surfaces red switches to Ember"). If a palette value is ever nudged, these
 * fail rather than the product quietly shipping unreadable text.
 */

describe("the palette matches the ratios the brand guide claims", () => {
  const claims: [string, string, string, number][] = [
    ["Ink on Paper", BRAND.ink, BRAND.paper, 19.28],
    ["Graphite on Paper", BRAND.graphite, BRAND.paper, 11.3],
    ["Slate on Paper", BRAND.slate, BRAND.paper, 7.05],
    ["Deep Red on Paper", BRAND.deepRed, BRAND.paper, 7.68],
    ["white on Signal Red", BRAND.paper, BRAND.signalRed, 4.73],
    ["Ember on Ink", BRAND.ember, BRAND.ink, 6.96],
    ["Success on Paper", BRAND.success, BRAND.paper, 5.39],
    ["Warning on Paper", BRAND.warning, BRAND.paper, 6.39],
    ["Info on Paper", BRAND.info, BRAND.paper, 6.81],
  ];

  for (const [name, fg, bg, claimed] of claims) {
    it(`${name} is ${claimed}:1`, () => {
      // Within a hundredth — the guide rounds to 2dp.
      expect(Math.abs(ratio(fg, bg) - claimed)).toBeLessThan(0.02);
    });
  }
});

describe("the rules those ratios justify", () => {
  it("keeps body and metadata at 7:1 on Paper, the guide's own bar", () => {
    for (const fg of [BRAND.ink, BRAND.graphite, BRAND.slate]) {
      expect(meets(fg, BRAND.paper, "AAA", "normal")).toBe(true);
    }
  });

  it("only clears AA for white on Signal Red, never AAA — hence the 15px/600 floor", () => {
    expect(meets(BRAND.paper, BRAND.signalRed, "AA", "normal")).toBe(true);
    expect(meets(BRAND.paper, BRAND.signalRed, "AAA", "normal")).toBe(false);
  });

  it("explains why red becomes Ember on Ink: Signal Red on Ink fails AA", () => {
    // The guide says Signal Red on Ink "only reaches 4.07:1" — under the 4.5
    // needed for normal text, which is exactly why the Ember token exists.
    expect(contrast(BRAND.signalRed, BRAND.ink)).toBeLessThan(4.5);
    expect(meets(BRAND.ember, BRAND.ink, "AA", "normal")).toBe(true);
  });

  it("keeps Slate placeholders legible on Mist, not just on Paper", () => {
    // Mist is the filter panel and row-hover surface, so label text sits on it.
    expect(meets(BRAND.slate, BRAND.mist, "AA", "normal")).toBe(true);
  });

  it("gives the Info focus ring 3:1 against both surfaces it lands on", () => {
    // WCAG 2.2 non-text contrast: a focus indicator nobody can see is not one.
    expect(meetsNonText(BRAND.info, BRAND.paper)).toBe(true);
    expect(meetsNonText(BRAND.info, BRAND.mist)).toBe(true);
  });

  it("flags that Line borders are decorative, not indicators", () => {
    // Line is deliberately below 3:1 — it is a hairline rule, so it must never
    // be the only thing marking a control's boundary or state.
    expect(meetsNonText(BRAND.line, BRAND.paper)).toBe(false);
  });

  it("keeps status colours readable as text, since pills must not rely on colour alone", () => {
    for (const fg of [BRAND.success, BRAND.warning, BRAND.info, BRAND.deepRed]) {
      expect(meets(fg, BRAND.paper, "AA", "normal")).toBe(true);
    }
  });
});
