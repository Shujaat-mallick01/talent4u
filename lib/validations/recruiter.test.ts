import { describe, expect, it } from "vitest";

import {
  LOGO_MAX_BYTES,
  recruiterOnboardingSchema,
  validateLogo,
} from "./recruiter";

const valid = () => ({
  companyName: "Acme Commerce Ltd",
  companyDomain: "acme.com",
  registrationNo: "09876543",
  linkedinUrl: "https://linkedin.com/company/acme",
  websiteUrl: "https://acme.com",
  description:
    "Acme Commerce builds headless storefronts for mid-market retailers and hires freelancers for focused, well-scoped engagements.",
  country: "GB",
});

describe("recruiterOnboardingSchema", () => {
  it("accepts a complete, valid submission", () => {
    expect(recruiterOnboardingSchema.safeParse(valid()).success).toBe(true);
  });

  it("normalizes a pasted URL / www. to a bare domain", () => {
    const parsed = recruiterOnboardingSchema.safeParse({
      ...valid(),
      companyDomain: "https://www.Acme.com/careers",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.companyDomain).toBe("acme.com");
  });

  it("collapses empty optionals to null", () => {
    const parsed = recruiterOnboardingSchema.safeParse({
      ...valid(),
      companyDomain: "",
      registrationNo: "  ",
      linkedinUrl: "",
      websiteUrl: "",
      description: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.companyDomain).toBeNull();
      expect(parsed.data.registrationNo).toBeNull();
      expect(parsed.data.linkedinUrl).toBeNull();
      expect(parsed.data.websiteUrl).toBeNull();
      expect(parsed.data.description).toBeNull();
    }
  });

  const rejects = (patch: Record<string, unknown>, field: string) => {
    const parsed = recruiterOnboardingSchema.safeParse({ ...valid(), ...patch });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((i) => i.path[0] === field)).toBe(true);
  };

  it("rejects an empty company name", () => rejects({ companyName: "" }, "companyName"));
  it("rejects a single-label domain", () => rejects({ companyDomain: "acme" }, "companyDomain"));
  it("rejects a garbage domain", () => rejects({ companyDomain: "not a domain!!" }, "companyDomain"));
  it("rejects an IPv4 literal as a domain", () =>
    rejects({ companyDomain: "192.168.1.1" }, "companyDomain"));
  it("rejects numeric shorthand that would rewrite to an IP", () =>
    rejects({ companyDomain: "123.456" }, "companyDomain"));
  it("rejects a bare integer host", () =>
    rejects({ companyDomain: "2130706433" }, "companyDomain"));
  it("rejects an unknown country", () => rejects({ country: "ZZ" }, "country"));
  it("rejects a non-https website", () => rejects({ websiteUrl: "http://acme.com" }, "websiteUrl"));
  it("rejects a LinkedIn URL on the wrong host", () =>
    rejects({ linkedinUrl: "https://twitter.com/acme" }, "linkedinUrl"));
  it("rejects a too-short description when provided", () =>
    rejects({ description: "too short" }, "description"));

  it("never throws on a scheme-less linkedin URL (returns a field error)", () => {
    const run = () => recruiterOnboardingSchema.safeParse({ ...valid(), linkedinUrl: "linkedin.com/company/acme" });
    expect(run).not.toThrow();
    expect(run().success).toBe(false);
  });
});

describe("validateLogo", () => {
  it("treats a missing or empty file as no logo", () => {
    expect(validateLogo(null)).toEqual({ ok: true, file: null });
    expect(validateLogo(new File([], "empty.png", { type: "image/png" }))).toEqual({
      ok: true,
      file: null,
    });
  });

  it("accepts an allowed image within the size cap", () => {
    const f = new File([new Uint8Array(1024)], "logo.png", { type: "image/png" });
    const result = validateLogo(f);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toBe(f);
  });

  it("rejects a disallowed type (incl. SVG)", () => {
    expect(validateLogo(new File([new Uint8Array(10)], "logo.svg", { type: "image/svg+xml" })).ok).toBe(false);
    expect(validateLogo(new File([new Uint8Array(10)], "logo.gif", { type: "image/gif" })).ok).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const big = new File([new Uint8Array(LOGO_MAX_BYTES + 1)], "big.png", { type: "image/png" });
    expect(validateLogo(big).ok).toBe(false);
  });
});
