import { describe, expect, it } from "vitest";

import { COUNTRIES } from "@/lib/geo/countries";

import { bandForCountry, DEFAULT_BAND, isReducedBand, type PriceBand } from "./bands";
import { featuresFor, upsellLine } from "./catalogue";
import { formatCents, formatMonthly, listPriceFor, priceFor, priceForCountry } from "./prices";

const BANDS: PriceBand[] = ["STANDARD", "MID", "LOW"];

describe("bandForCountry", () => {
  it("puts high-income countries on the standard price", () => {
    for (const code of ["US", "GB", "DE", "AU", "CA", "JP", "SG", "AE", "NL", "SE"]) {
      expect(bandForCountry(code)).toBe("STANDARD");
    }
  });

  it("puts our core freelancer markets in the lowest band", () => {
    for (const code of ["PK", "IN", "BD", "NG", "PH", "EG", "KE", "VN", "LK", "UA"]) {
      expect(bandForCountry(code)).toBe("LOW");
    }
  });

  it("puts upper-middle income countries in the mid band", () => {
    for (const code of ["BR", "MX", "TR", "ZA", "TH", "MY", "CN", "RU", "AR", "CO"]) {
      expect(bandForCountry(code)).toBe("MID");
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(bandForCountry("pk")).toBe("LOW");
    expect(bandForCountry(" Pk ")).toBe("LOW");
  });

  it("falls back to the list price for an absent or unknown country", () => {
    // Never guess a discount from a missing signal — the fallback costs the
    // customer more, which is the mistake that gets noticed and corrected.
    expect(bandForCountry(null)).toBe(DEFAULT_BAND);
    expect(bandForCountry(undefined)).toBe(DEFAULT_BAND);
    expect(bandForCountry("")).toBe(DEFAULT_BAND);
    expect(bandForCountry("ZZ")).toBe(DEFAULT_BAND);
    expect(DEFAULT_BAND).toBe("STANDARD");
  });

  it("resolves a band for every country the profile forms offer", () => {
    // A country a user can select must never fall through to something the
    // price table cannot price.
    for (const country of COUNTRIES) {
      expect(BANDS).toContain(bandForCountry(country.code));
    }
  });

  it("classifies no country into two bands at once", () => {
    const counts = new Map<string, number>();
    for (const country of COUNTRIES) {
      const band = bandForCountry(country.code);
      counts.set(band, (counts.get(band) ?? 0) + 1);
    }
    // Sanity: the split is real, not everything collapsing into one band.
    expect(counts.get("LOW") ?? 0).toBeGreaterThan(20);
    expect(counts.get("MID") ?? 0).toBeGreaterThan(10);
    expect(counts.get("STANDARD") ?? 0).toBeGreaterThan(20);
  });
});

describe("the price table", () => {
  it("charges the CLAUDE.md list prices at the standard band", () => {
    // "Pro tier ($6/mo)", "Growth ($79/mo)", "Team ($249/mo)".
    expect(priceFor("FREELANCER_PRO", "STANDARD").display).toBe("$6");
    expect(priceFor("RECRUITER_GROWTH", "STANDARD").display).toBe("$79");
    expect(priceFor("RECRUITER_TEAM", "STANDARD").display).toBe("$249");
  });

  it("keeps FREE free in every band", () => {
    for (const band of BANDS) {
      expect(priceFor("FREE", band).cents).toBe(0);
      expect(priceFor("FREE", band).display).toBe("Free");
      expect(priceFor("FREE", band).isReduced).toBe(false);
    }
  });

  it("never prices a reduced band above the list price", () => {
    const paid = ["FREELANCER_PRO", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const;
    for (const plan of paid) {
      const list = listPriceFor(plan).cents;
      expect(priceFor(plan, "MID").cents).toBeLessThan(list);
      expect(priceFor(plan, "LOW").cents).toBeLessThanOrEqual(priceFor(plan, "MID").cents);
      expect(priceFor(plan, "LOW").cents).toBeGreaterThan(0);
    }
  });

  it("stores whole cents, never fractions", () => {
    for (const band of BANDS) {
      for (const plan of ["FREE", "FREELANCER_PRO", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const) {
        expect(Number.isInteger(priceFor(plan, band).cents)).toBe(true);
      }
    }
  });

  it("flags a reduced price as reduced, and the list price as not", () => {
    expect(priceFor("FREELANCER_PRO", "LOW").isReduced).toBe(true);
    expect(priceFor("FREELANCER_PRO", "STANDARD").isReduced).toBe(false);
  });

  it("resolves by country end to end", () => {
    expect(priceForCountry("FREELANCER_PRO", "PK").cents).toBe(
      priceFor("FREELANCER_PRO", "LOW").cents,
    );
    expect(priceForCountry("RECRUITER_GROWTH", "US").cents).toBe(
      priceFor("RECRUITER_GROWTH", "STANDARD").cents,
    );
    expect(priceForCountry("FREELANCER_PRO", null).cents).toBe(
      priceFor("FREELANCER_PRO", "STANDARD").cents,
    );
  });
});

describe("formatting", () => {
  it("drops .00 from whole dollars but keeps real cents", () => {
    expect(formatCents(600)).toBe("$6");
    expect(formatCents(24900)).toBe("$249");
    expect(formatCents(250)).toBe("$2.50");
  });

  it("writes zero as Free, not $0", () => {
    expect(formatCents(0)).toBe("Free");
    expect(formatMonthly(priceFor("FREE", "LOW"))).toBe("Free");
  });

  it("appends the period only to a paid price", () => {
    expect(formatMonthly(priceFor("FREELANCER_PRO", "STANDARD"))).toBe("$6/mo");
  });

  it("builds the upsell line every gate reuses", () => {
    expect(upsellLine("FREELANCER_PRO", "STANDARD")).toBe("Pro ($6/mo)");
    expect(upsellLine("RECRUITER_GROWTH", "STANDARD")).toBe("Growth ($79/mo)");
    // A reduced-band viewer is quoted their own price, not the list price.
    expect(upsellLine("FREELANCER_PRO", "LOW")).not.toContain("$6");
  });

  it("marks reduced bands as reduced", () => {
    expect(isReducedBand("STANDARD")).toBe(false);
    expect(isReducedBand("MID")).toBe(true);
    expect(isReducedBand("LOW")).toBe(true);
  });
});

describe("catalogue features are derived, not retyped", () => {
  it("states the real application quota on the free freelancer plan", () => {
    const labels = featuresFor("FREELANCER", "FREE").map((f) => f.label);
    expect(labels.some((l) => l.includes("12 applications per 30 days"))).toBe(true);
  });

  it("shows the paid wall rather than hiding it", () => {
    // CLAUDE.md wants the wall visible: a free recruiter should see that
    // candidate search exists and that they do not have it.
    const free = featuresFor("RECRUITER", "FREE");
    const search = free.find((f) => f.label === "Candidate search");
    expect(search).toBeDefined();
    expect(search?.included).toBe(false);

    const growth = featuresFor("RECRUITER", "RECRUITER_GROWTH");
    expect(growth.find((f) => f.label === "Candidate search")?.included).toBe(true);
  });

  it("says unlimited rather than a number when a cap is lifted", () => {
    const team = featuresFor("RECRUITER", "RECRUITER_TEAM").map((f) => f.label);
    expect(team).toContain("Unlimited active job posts");
    expect(featuresFor("RECRUITER", "FREE").map((f) => f.label)).toContain("1 active job post");
  });

  it("states 0% commission on both sides", () => {
    for (const audience of ["FREELANCER", "RECRUITER"] as const) {
      const labels = featuresFor(audience, "FREE").map((f) => f.label);
      expect(labels.some((l) => l.includes("0% commission"))).toBe(true);
    }
  });

  it("never marks an already-free capability as missing from a plan", () => {
    // The failure this guards against: advertising something as a paid
    // upgrade that every account already has. A Growth customer reading
    // "— Company page" on a public pricing page is being told they lack a
    // page that has been live and indexed since Phase 2.
    const FREE_FOR_EVERYONE = [
      "Public company page",
      "Receive applications and reply",
      "Browse every job, always free",
    ];
    for (const audience of ["FREELANCER", "RECRUITER"] as const) {
      for (const plan of ["FREE", "FREELANCER_PRO", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const) {
        for (const line of featuresFor(audience, plan)) {
          if (FREE_FOR_EVERYONE.includes(line.label)) {
            expect(
              line.included,
              `"${line.label}" shown as missing on ${audience}/${plan}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("never claims income is tax free", () => {
    // CLAUDE.md: "Never write copy claiming income is 'tax free.' That is
    // legally indefensible."
    const everything = (["FREELANCER", "RECRUITER"] as const).flatMap((audience) =>
      (["FREE", "FREELANCER_PRO", "RECRUITER_GROWTH", "RECRUITER_TEAM"] as const).flatMap((plan) =>
        featuresFor(audience, plan).map((f) => f.label),
      ),
    );
    for (const label of everything) {
      expect(label.toLowerCase()).not.toContain("tax free");
      expect(label.toLowerCase()).not.toContain("tax-free");
    }
  });
});
