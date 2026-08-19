import { describe, expect, it } from "vitest";

import { authNoticeSchema, sanitizeNextPath } from "./auth";

describe("sanitizeNextPath", () => {
  it("accepts plain same-origin paths, canonicalized", () => {
    expect(sanitizeNextPath("/dashboard/freelancer")).toBe("/dashboard/freelancer");
    expect(sanitizeNextPath("/jobs?category=ai")).toBe("/jobs?category=ai");
    expect(sanitizeNextPath("/onboarding")).toBe("/onboarding");
    expect(sanitizeNextPath("/a/b#frag")).toBe("/a/b#frag");
  });

  it("rejects empty and non-path inputs", () => {
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
    expect(sanitizeNextPath("")).toBeNull();
    expect(sanitizeNextPath("dashboard")).toBeNull();
    expect(sanitizeNextPath("https://evil.com")).toBeNull();
    expect(sanitizeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects protocol-relative and host-smuggling vectors (open redirect)", () => {
    expect(sanitizeNextPath("//evil.com")).toBeNull();
    // Backslash folds to "/" in URL parsing -> "//evil.com".
    expect(sanitizeNextPath("/\\evil.com")).toBeNull();
    expect(sanitizeNextPath("/\\/evil.com")).toBeNull();
    // Tab / newline / CR are stripped by the URL parser and can smuggle a host.
    expect(sanitizeNextPath("/\t/evil.com")).toBeNull();
    expect(sanitizeNextPath("/\n/evil.com")).toBeNull();
    expect(sanitizeNextPath("/\r/evil.com")).toBeNull();
  });

  it("never returns a value that resolves off-origin", () => {
    const base = "http://app.test";
    for (const candidate of [
      "/dashboard",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/path/../still-here",
    ]) {
      const safe = sanitizeNextPath(candidate);
      if (safe !== null) {
        expect(new URL(safe, base).origin).toBe(base);
      }
    }
  });
});

describe("authNoticeSchema", () => {
  it("accepts known codes and rejects arbitrary text", () => {
    expect(authNoticeSchema.safeParse("invalid_credentials").success).toBe(true);
    expect(authNoticeSchema.safeParse("email_conflict").success).toBe(true);
    expect(authNoticeSchema.safeParse("Call 1-800-SCAM to unlock").success).toBe(false);
    expect(authNoticeSchema.safeParse("<script>").success).toBe(false);
  });
});
