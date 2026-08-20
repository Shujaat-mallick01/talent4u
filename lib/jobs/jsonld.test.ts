import { describe, expect, it } from "vitest";

import { decideJobVisibility, jobPostingJsonLd } from "./jsonld";

const base = () => ({
  title: "Senior Next.js developer",
  description: "Rebuild our portal.",
  slug: "senior-next-js-developer",
  url: "https://t/jobs/senior-next-js-developer",
  datePosted: new Date("2026-08-19T10:00:00.000Z"),
  engagementType: "FULL_TIME" as const,
  isRemote: true,
  location: null,
  budgetMinUsd: 4000,
  budgetMaxUsd: 6500,
  company: { name: "Acme", url: "https://t/companies/acme", logoUrl: "https://cdn/l.png" },
  companyCountryName: "Germany",
  companyCountryCode: "DE",
});

describe("jobPostingJsonLd", () => {
  it("builds a JobPosting with organization and identifier", () => {
    const ld = jobPostingJsonLd(base());
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.title).toBe("Senior Next.js developer");
    expect(ld.datePosted).toBe("2026-08-19T10:00:00.000Z");
    expect(ld.employmentType).toBe("FULL_TIME");
    expect(ld.hiringOrganization).toMatchObject({ name: "Acme", logo: "https://cdn/l.png" });
  });

  it("marks remote jobs TELECOMMUTE with a REAL country requirement", () => {
    const ld = jobPostingJsonLd(base());
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    // Google rejects invented values like "Anywhere" — must be a real country.
    expect(ld.applicantLocationRequirements).toEqual({ "@type": "Country", name: "Germany" });
    expect(ld.jobLocation).toBeUndefined();
  });

  it("gives onsite jobs a locality + required addressCountry", () => {
    const ld = jobPostingJsonLd({ ...base(), isRemote: false, location: "Hamburg, Germany" });
    expect(ld.jobLocationType).toBeUndefined();
    expect(ld.jobLocation).toMatchObject({
      address: {
        addressLocality: "Hamburg, Germany",
        addressCountry: "DE",
      },
    });
  });

  it("maps FIXED and HOURLY to CONTRACTOR", () => {
    expect(jobPostingJsonLd({ ...base(), engagementType: "FIXED" }).employmentType).toBe(
      "CONTRACTOR",
    );
    expect(jobPostingJsonLd({ ...base(), engagementType: "HOURLY" }).employmentType).toBe(
      "CONTRACTOR",
    );
  });

  it("emits baseSalary only for HOURLY engagements", () => {
    expect(jobPostingJsonLd(base()).baseSalary).toBeUndefined();
    const hourly = jobPostingJsonLd({
      ...base(),
      engagementType: "HOURLY",
      budgetMinUsd: 60,
      budgetMaxUsd: 90,
    });
    expect(hourly.baseSalary).toMatchObject({
      currency: "USD",
      value: { minValue: 60, maxValue: 90, unitText: "HOUR" },
    });
  });

  it("omits baseSalary for a budget-less hourly job", () => {
    const ld = jobPostingJsonLd({
      ...base(),
      engagementType: "HOURLY",
      budgetMinUsd: null,
      budgetMaxUsd: null,
    });
    expect(ld.baseSalary).toBeUndefined();
  });
});

describe("decideJobVisibility", () => {
  const cutoff = new Date("2026-08-20T06:00:00.000Z");
  const outside = new Date("2026-08-20T00:00:00.000Z"); // before cutoff
  const inside = new Date("2026-08-20T09:00:00.000Z"); // after cutoff

  const job = (over: Partial<Parameters<typeof decideJobVisibility>[0]> = {}) => ({
    status: "ACTIVE",
    publishedAt: outside,
    recruiterBanned: false,
    ...over,
  });

  it("shows an ACTIVE job outside the window to everyone", () => {
    expect(decideJobVisibility(job(), cutoff)).toBe("full");
    expect(decideJobVisibility(job(), null)).toBe("full");
  });

  it("hides an inside-window job from non-Pro viewers but not Pro", () => {
    expect(decideJobVisibility(job({ publishedAt: inside }), cutoff)).toBe("not-found");
    expect(decideJobVisibility(job({ publishedAt: inside }), null)).toBe("full");
  });

  it("renders CLOSED as an archived page regardless of viewer", () => {
    expect(decideJobVisibility(job({ status: "CLOSED" }), cutoff)).toBe("closed");
    expect(decideJobVisibility(job({ status: "CLOSED" }), null)).toBe("closed");
  });

  it("hides DRAFT, PENDING_REVIEW, and REMOVED from everyone", () => {
    for (const status of ["DRAFT", "PENDING_REVIEW", "REMOVED"]) {
      expect(decideJobVisibility(job({ status, publishedAt: null }), null)).toBe("not-found");
      expect(decideJobVisibility(job({ status }), cutoff)).toBe("not-found");
    }
  });

  it("hides a banned recruiter's job even if still ACTIVE (defence in depth)", () => {
    expect(decideJobVisibility(job({ recruiterBanned: true }), null)).toBe("not-found");
  });

  it("hides an ACTIVE job with no publishedAt (impossible per CHECK, but never render it)", () => {
    expect(decideJobVisibility(job({ publishedAt: null }), null)).toBe("not-found");
  });
});
