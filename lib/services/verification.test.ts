import { describe, expect, it } from "vitest";

import {
  emailDomain,
  emailProvesDomain,
  qualifiesForTrusted,
  TRUSTED_ENGAGEMENT_THRESHOLD,
  verificationReadiness,
} from "./verification";

describe("emailDomain", () => {
  it("extracts and lowercases the host", () => {
    expect(emailDomain("Jane@Acme.COM")).toBe("acme.com");
    expect(emailDomain("  jane@acme.com  ")).toBe("acme.com");
    expect(emailDomain("jane+jobs@acme.com")).toBe("acme.com");
  });

  it("rejects anything that is not one address", () => {
    expect(emailDomain("jane")).toBeNull();
    expect(emailDomain("@acme.com")).toBeNull();
    expect(emailDomain("jane@")).toBeNull();
    expect(emailDomain("jane@acme@evil.com")).toBeNull();
    expect(emailDomain("jane@localhost")).toBeNull();
    expect(emailDomain("jane@-acme.com")).toBeNull();
  });
});

describe("emailProvesDomain", () => {
  it("accepts an exact host match", () => {
    expect(emailProvesDomain("jane@acme.com", "acme.com")).toBe(true);
    expect(emailProvesDomain("JANE@ACME.COM", "Acme.com")).toBe(true);
  });

  it("accepts a subdomain of the company domain", () => {
    expect(emailProvesDomain("jane@mail.acme.com", "acme.com")).toBe(true);
    expect(emailProvesDomain("jane@eu.corp.acme.com", "acme.com")).toBe(true);
  });

  it("tolerates a www-prefixed stored domain", () => {
    expect(emailProvesDomain("jane@acme.com", "www.acme.com")).toBe(true);
  });

  it("rejects a lookalike that merely ends with the domain text", () => {
    // notacme.com must not satisfy acme.com — the boundary dot matters.
    expect(emailProvesDomain("jane@notacme.com", "acme.com")).toBe(false);
    expect(emailProvesDomain("jane@acme.com.evil.net", "acme.com")).toBe(false);
  });

  it("never accepts a consumer mailbox provider as a business domain", () => {
    expect(emailProvesDomain("jane@gmail.com", "gmail.com")).toBe(false);
    expect(emailProvesDomain("jane@yahoo.co.uk", "yahoo.co.uk")).toBe(false);
    expect(emailProvesDomain("jane@mailinator.com", "mailinator.com")).toBe(false);
  });

  it("rejects a missing or empty domain", () => {
    expect(emailProvesDomain("jane@acme.com", null)).toBe(false);
    expect(emailProvesDomain("jane@acme.com", "")).toBe(false);
    expect(emailProvesDomain("jane@acme.com", "   ")).toBe(false);
  });

  it("rejects when the account email is at a different company", () => {
    expect(emailProvesDomain("jane@othercorp.com", "acme.com")).toBe(false);
  });

  // Regression: claiming a public suffix would otherwise let ANY mailbox
  // under it satisfy the subdomain rule.
  it("rejects public suffixes and bare TLDs as company domains", () => {
    expect(emailProvesDomain("jane@yahoo.co.uk", "co.uk")).toBe(false);
    expect(emailProvesDomain("jane@acme.co.uk", "co.uk")).toBe(false);
    expect(emailProvesDomain("jane@acme.com.au", "com.au")).toBe(false);
    expect(emailProvesDomain("jane@acme.com", "com")).toBe(false);
    // A real company domain UNDER a public suffix still works.
    expect(emailProvesDomain("jane@acme.co.uk", "acme.co.uk")).toBe(true);
  });

  it("rejects a consumer mailbox host whatever domain is claimed", () => {
    expect(emailProvesDomain("jane@gmail.com", "acme.com")).toBe(false);
    expect(emailProvesDomain("jane@yahoo.co.uk", "acme.co.uk")).toBe(false);
  });

  it("tolerates a trailing dot on the claimed domain", () => {
    expect(emailProvesDomain("jane@acme.com", "acme.com.")).toBe(true);
  });
});

describe("verificationReadiness", () => {
  const complete = {
    accountEmail: "jane@acme.com",
    companyDomain: "acme.com",
    registrationNo: "09876543",
    linkedinUrl: "https://linkedin.com/company/acme",
  };

  it("is ready when all three requirements are met", () => {
    const r = verificationReadiness(complete);
    expect(r.ready).toBe(true);
    expect(r.requirements.every((x) => x.met)).toBe(true);
  });

  it("refuses an unconfirmed account email — it proves nothing", () => {
    const r = verificationReadiness({ ...complete, accountEmailVerified: false });
    expect(r.ready).toBe(false);
    expect(r.requirements.filter((x) => !x.met).map((x) => x.key)).toEqual(["domainEmail"]);
    expect(r.requirements[0].hint).toContain("Confirm your account email");
  });

  it("names exactly the unmet requirement", () => {
    const noReg = verificationReadiness({ ...complete, registrationNo: null });
    expect(noReg.ready).toBe(false);
    expect(noReg.requirements.filter((x) => !x.met).map((x) => x.key)).toEqual(["registrationNo"]);

    const noLinkedin = verificationReadiness({ ...complete, linkedinUrl: "  " });
    expect(noLinkedin.requirements.filter((x) => !x.met).map((x) => x.key)).toEqual(["linkedinUrl"]);

    const consumerEmail = verificationReadiness({
      ...complete,
      accountEmail: "jane@gmail.com",
      companyDomain: "gmail.com",
    });
    expect(consumerEmail.requirements.filter((x) => !x.met).map((x) => x.key)).toEqual([
      "domainEmail",
    ]);
  });

  it("always reports all three requirements, met or not", () => {
    const r = verificationReadiness({
      accountEmail: "x@y",
      companyDomain: null,
      registrationNo: null,
      linkedinUrl: null,
    });
    expect(r.requirements.map((x) => x.key)).toEqual([
      "domainEmail",
      "registrationNo",
      "linkedinUrl",
    ]);
    expect(r.ready).toBe(false);
  });
});

describe("qualifiesForTrusted", () => {
  it("requires VERIFIED — never promotes straight from UNVERIFIED", () => {
    expect(qualifiesForTrusted("UNVERIFIED", 99)).toBe(false);
  });

  it("requires the threshold in DISTINCT freelancers", () => {
    expect(qualifiesForTrusted("VERIFIED", TRUSTED_ENGAGEMENT_THRESHOLD - 1)).toBe(false);
    expect(qualifiesForTrusted("VERIFIED", TRUSTED_ENGAGEMENT_THRESHOLD)).toBe(true);
    expect(qualifiesForTrusted("VERIFIED", TRUSTED_ENGAGEMENT_THRESHOLD + 5)).toBe(true);
  });

  it("is a no-op for an already-TRUSTED recruiter", () => {
    expect(qualifiesForTrusted("TRUSTED", 10)).toBe(false);
  });

  it("matches the CLAUDE.md threshold of 3", () => {
    expect(TRUSTED_ENGAGEMENT_THRESHOLD).toBe(3);
  });
});
