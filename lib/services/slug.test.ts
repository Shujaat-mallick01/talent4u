import { describe, expect, it } from "vitest";

import { pickAvailableSlug, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Commerce Ltd", "company")).toBe("acme-commerce-ltd");
  });
  it("strips diacritics", () => {
    expect(slugify("Nordhafen Systeme GmbH", "company")).toBe("nordhafen-systeme-gmbh");
    expect(slugify("Zürich Labs", "company")).toBe("zurich-labs");
  });
  it("collapses punctuation and trims dashes", () => {
    expect(slugify("  —Acme, Inc.!!  ", "company")).toBe("acme-inc");
  });
  it("uses the provided fallback when nothing usable remains", () => {
    expect(slugify("···", "company")).toBe("company");
    expect(slugify("", "freelancer")).toBe("freelancer");
  });
  it("caps length without a trailing dash", () => {
    const s = slugify("a".repeat(80), "company");
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("pickAvailableSlug", () => {
  it("returns the base when free", () => {
    expect(pickAvailableSlug("acme", new Set())).toBe("acme");
  });
  it("finds the first free numbered variant", () => {
    expect(pickAvailableSlug("acme", new Set(["acme", "acme-2"]))).toBe("acme-3");
  });
  it("ignores unrelated slugs sharing the prefix", () => {
    // "acme-labs" starts with "acme-" but is not in the numbered sequence.
    expect(pickAvailableSlug("acme", new Set(["acme", "acme-labs"]))).toBe("acme-2");
  });
});
