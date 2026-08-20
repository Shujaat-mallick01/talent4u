import { describe, expect, it } from "vitest";

import { freelancerOnboardingSchema, isValidTimezone } from "./freelancer";

const valid = () => ({
  displayName: "Jane Cooper",
  headline: "Senior Shopify developer for high-volume stores",
  bio: "I build and scale Shopify Plus storefronts for merchants doing seven figures a year. My focus is checkout performance, custom apps, and the unglamorous data plumbing that keeps a catalog of tens of thousands of SKUs fast.",
  country: "PK",
  timezone: "Asia/Karachi",
  hourlyRateUsd: 45,
  isOpenToWork: true,
  skills: [
    { slug: "shopify", yearsExp: 6 },
    { slug: "typescript", yearsExp: 8 },
  ],
  githubUrl: "https://github.com/janecooper",
  portfolioUrl: "https://janecooper.dev",
  linkedinUrl: "https://linkedin.com/in/janecooper",
});

describe("freelancerOnboardingSchema", () => {
  it("accepts a complete, valid submission", () => {
    expect(freelancerOnboardingSchema.safeParse(valid()).success).toBe(true);
  });

  it("collapses empty optional URLs to null", () => {
    const parsed = freelancerOnboardingSchema.safeParse({
      ...valid(),
      githubUrl: "",
      portfolioUrl: "   ",
      linkedinUrl: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.githubUrl).toBeNull();
      expect(parsed.data.portfolioUrl).toBeNull();
      expect(parsed.data.linkedinUrl).toBeNull();
    }
  });

  it("allows a null hourly rate", () => {
    const parsed = freelancerOnboardingSchema.safeParse({ ...valid(), hourlyRateUsd: null });
    expect(parsed.success).toBe(true);
  });

  const rejects = (patch: Record<string, unknown>, field: string) => {
    const parsed = freelancerOnboardingSchema.safeParse({ ...valid(), ...patch });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === field)).toBe(true);
    }
  };

  it("rejects a short bio", () => rejects({ bio: "too short" }, "bio"));
  it("rejects a short headline", () => rejects({ headline: "hi" }, "headline"));
  it("rejects an empty display name", () => rejects({ displayName: "" }, "displayName"));
  it("rejects an unknown country", () => rejects({ country: "ZZ" }, "country"));
  it("rejects an invalid timezone", () => rejects({ timezone: "Mars/Phobos" }, "timezone"));
  it("rejects a zero hourly rate", () => rejects({ hourlyRateUsd: 0 }, "hourlyRateUsd"));
  it("rejects a negative hourly rate", () => rejects({ hourlyRateUsd: -5 }, "hourlyRateUsd"));
  it("rejects an empty skills list", () => rejects({ skills: [] }, "skills"));
  it("rejects duplicate skills", () =>
    rejects({ skills: [{ slug: "shopify", yearsExp: 1 }, { slug: "shopify", yearsExp: 2 }] }, "skills"));
  it("rejects more than 20 skills", () =>
    rejects(
      { skills: Array.from({ length: 21 }, (_, i) => ({ slug: `skill-${i}`, yearsExp: 1 })) },
      "skills",
    ));
  it("rejects a GitHub URL on the wrong host", () =>
    rejects({ githubUrl: "https://gitlab.com/janecooper" }, "githubUrl"));
  it("rejects a non-https portfolio URL", () =>
    rejects({ portfolioUrl: "http://janecooper.dev" }, "portfolioUrl"));
  it("rejects a LinkedIn URL on the wrong host", () =>
    rejects({ linkedinUrl: "https://example.com/in/x" }, "linkedinUrl"));

  // Regression: a scheme-less host-checked URL must return a field error, not
  // throw a TypeError out of safeParse (which would 500 the Server Action).
  it("returns a field error (never throws) for scheme-less host URLs", () => {
    for (const bad of ["github.com", "github.com/jane", "www.github.com/jane", "notaurl"]) {
      const run = () => freelancerOnboardingSchema.safeParse({ ...valid(), githubUrl: bad });
      expect(run).not.toThrow();
      const parsed = run();
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((i) => i.path[0] === "githubUrl")).toBe(true);
      }
    }
    const li = () =>
      freelancerOnboardingSchema.safeParse({ ...valid(), linkedinUrl: "linkedin.com/in/jane" });
    expect(li).not.toThrow();
    expect(li().success).toBe(false);
  });

  it("rejects userinfo host-spoofing (https://github.com@evil.com)", () =>
    rejects({ githubUrl: "https://github.com@evil.com" }, "githubUrl"));

  it("rejects suffix host-spoofing (https://github.com.evil.com)", () =>
    rejects({ githubUrl: "https://github.com.evil.com" }, "githubUrl"));

  it("accepts a github subdomain (gist.github.com)", () => {
    const parsed = freelancerOnboardingSchema.safeParse({
      ...valid(),
      githubUrl: "https://gist.github.com/janecooper",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("isValidTimezone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Asia/Karachi")).toBe(true);
    expect(isValidTimezone("Europe/Warsaw")).toBe(true);
  });
  it("rejects nonsense", () => {
    expect(isValidTimezone("Mars/Phobos")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});
