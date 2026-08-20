import { describe, expect, it } from "vitest";

import { freelancerVerificationBadge, recruiterTierBadge } from "./badges";
import {
  companyOrganizationJsonLd,
  freelancerPersonJsonLd,
  jsonLdScript,
} from "./jsonld";
import { averageRating } from "./reviews";

describe("recruiterTierBadge", () => {
  it("labels every tier, and always labels UNVERIFIED", () => {
    expect(recruiterTierBadge("UNVERIFIED")).toMatchObject({ label: "Unverified", tone: "muted" });
    expect(recruiterTierBadge("VERIFIED")).toMatchObject({ label: "Verified", tone: "blue" });
    expect(recruiterTierBadge("TRUSTED")).toMatchObject({ label: "Trusted", tone: "gold" });
  });
});

describe("freelancerVerificationBadge", () => {
  it("maps each verification level", () => {
    expect(freelancerVerificationBadge("NONE").tone).toBe("muted");
    expect(freelancerVerificationBadge("ID_VERIFIED").tone).toBe("blue");
    expect(freelancerVerificationBadge("ID_AND_WORK_VERIFIED").tone).toBe("green");
  });
});

describe("averageRating", () => {
  it("is null with no ratings", () => expect(averageRating([])).toBeNull());
  it("rounds to one decimal", () => {
    expect(averageRating([5, 4])).toBe(4.5);
    expect(averageRating([5, 4, 4])).toBe(4.3);
  });
});

describe("freelancerPersonJsonLd", () => {
  const base = {
    displayName: "Jane Cooper",
    headline: "Shopify dev",
    bio: "Bio here",
    country: "PK",
    url: "https://t/f/jane",
    skills: ["Shopify"],
    sameAs: ["https://github.com/j", null, undefined] as (string | null | undefined)[],
    ratingAverage: 4.5,
    ratingCount: 2,
  };

  it("is a Person with an aggregateRating when reviewed", () => {
    const ld = freelancerPersonJsonLd(base);
    expect(ld["@type"]).toBe("Person");
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.5, reviewCount: 2 });
  });

  it("drops null sameAs entries", () => {
    const ld = freelancerPersonJsonLd(base);
    expect(ld.sameAs).toEqual(["https://github.com/j"]);
  });

  it("omits aggregateRating with no reviews", () => {
    const ld = freelancerPersonJsonLd({ ...base, ratingAverage: null, ratingCount: 0 });
    expect(ld.aggregateRating).toBeUndefined();
  });

  it("omits an empty sameAs entirely", () => {
    const ld = freelancerPersonJsonLd({ ...base, sameAs: [null, undefined] });
    expect("sameAs" in ld).toBe(false);
  });
});

describe("companyOrganizationJsonLd", () => {
  it("prefers the website URL and includes the logo", () => {
    const ld = companyOrganizationJsonLd({
      companyName: "Acme",
      description: "We build things",
      country: "GB",
      url: "https://t/c/acme",
      websiteUrl: "https://acme.com",
      logoUrl: "https://cdn/logo.png",
      sameAs: ["https://acme.com", "https://linkedin.com/company/acme"],
      ratingAverage: null,
      ratingCount: 0,
    });
    expect(ld["@type"]).toBe("Organization");
    expect(ld.url).toBe("https://acme.com");
    expect(ld.logo).toBe("https://cdn/logo.png");
    expect(ld.aggregateRating).toBeUndefined();
  });
});

describe("jsonLdScript", () => {
  it("escapes < so a payload cannot close the script tag", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
  });

  it("escapes U+2028 / U+2029 line separators", () => {
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    const out = jsonLdScript({ name: `a${LS}b${PS}c` });
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("round-trips to valid JSON", () => {
    const out = jsonLdScript({ a: 1, b: "x</b>" });
    expect(JSON.parse(out)).toEqual({ a: 1, b: "x</b>" });
  });
});
