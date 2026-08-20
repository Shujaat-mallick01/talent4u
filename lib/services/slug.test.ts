import { describe, expect, it } from "vitest";

import { isPlausibleSlug, pickAvailableSlug, slugify } from "./slug";

describe("isPlausibleSlug", () => {
  it("accepts every slug we mint", () => {
    expect(isPlausibleSlug("jane-cooper")).toBe(true);
    expect(isPlausibleSlug("acme-commerce-ltd-2")).toBe(true);
    expect(isPlausibleSlug(slugify("Some Job Title Here!", "job"))).toBe(true);
  });

  it("rejects request garbage that would 500 at the database", () => {
    expect(isPlausibleSlug(`abc${String.fromCharCode(0)}def`)).toBe(false); // NUL — Postgres 22021
    expect(isPlausibleSlug("")).toBe(false);
    expect(isPlausibleSlug("UPPER-case")).toBe(false);
    expect(isPlausibleSlug("space here")).toBe(false);
    expect(isPlausibleSlug("unicode-héllo")).toBe(false);
    expect(isPlausibleSlug("a".repeat(200))).toBe(false);
  });
});

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
