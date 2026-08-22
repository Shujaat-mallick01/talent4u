import { describe, expect, it } from "vitest";

import { profileStrength, type StrengthInput } from "./profile-strength";

/**
 * The meter is a promise: the number on the dashboard has to be arithmetic a
 * person could redo by hand. These tests pin the three things that would make
 * it a lie — a total that is not 100, a "done" that is not what the label
 * says, and a next step that is not the biggest thing left.
 */

/** A profile with nothing filled in. Every item false. */
const EMPTY: StrengthInput = {
  headline: "",
  bio: "",
  hourlyRateUsd: null,
  avatarUrl: null,
  githubUrl: null,
  portfolioUrl: null,
  linkedinUrl: null,
  skillCount: 0,
  verificationSubmittedAt: null,
  verificationNote: null,
};

/** A profile with every item satisfied. */
const COMPLETE: StrengthInput = {
  headline: "Senior Shopify developer for high-volume stores",
  bio: "x".repeat(300),
  hourlyRateUsd: 65,
  avatarUrl: "https://example.com/a.png",
  githubUrl: "https://github.com/example",
  portfolioUrl: null,
  linkedinUrl: null,
  skillCount: 5,
  verificationSubmittedAt: new Date("2026-01-01T00:00:00Z"),
  verificationNote: null,
};

const at = (input: StrengthInput, key: string) => {
  const item = profileStrength(input).items.find((i) => i.key === key);
  if (!item) throw new Error(`no strength item "${key}"`);
  return item;
};

const done = (input: StrengthInput, key: string) => at(input, key).done;

describe("profileStrength weights", () => {
  it("has weights that sum to exactly 100", () => {
    const total = profileStrength(EMPTY).items.reduce((n, i) => n + i.weight, 0);
    expect(total).toBe(100);
  });

  it("scores a complete profile at 100 with nothing left to do", () => {
    const strength = profileStrength(COMPLETE);
    expect(strength.percent).toBe(100);
    expect(strength.next).toBeNull();
    expect(strength.items.every((i) => i.done)).toBe(true);
  });

  it("scores an empty profile at 0", () => {
    expect(profileStrength(EMPTY).percent).toBe(0);
  });

  it("credits a nearly empty profile rather than rounding it away", () => {
    // The lightest item on its own still moves the number: a person who did
    // one thing must see that one thing.
    const strength = profileStrength({ ...EMPTY, verificationNote: "approved: github" });
    expect(strength.percent).toBe(10);
    expect(strength.percent).toBeGreaterThan(0);
  });

  it("adds each item's weight independently", () => {
    // bio (20) + rate (15), nothing else.
    const strength = profileStrength({ ...EMPTY, bio: "y".repeat(300), hourlyRateUsd: 40 });
    expect(strength.percent).toBe(35);
  });
});

describe("profileStrength item predicates", () => {
  it("counts a bio only at 300 characters of real text", () => {
    expect(done({ ...EMPTY, bio: "x".repeat(299) }, "bio")).toBe(false);
    expect(done({ ...EMPTY, bio: "x".repeat(300) }, "bio")).toBe(true);
    // Padding is not writing: whitespace is trimmed before counting.
    expect(done({ ...EMPTY, bio: `  ${"x".repeat(299)}  ` }, "bio")).toBe(false);
  });

  it("counts skills at five or more", () => {
    expect(done({ ...EMPTY, skillCount: 4 }, "skills")).toBe(false);
    expect(done({ ...EMPTY, skillCount: 5 }, "skills")).toBe(true);
    expect(done({ ...EMPTY, skillCount: 12 }, "skills")).toBe(true);
  });

  it("accepts any one of the three work links", () => {
    expect(done(EMPTY, "work-link")).toBe(false);
    expect(done({ ...EMPTY, githubUrl: "https://github.com/a" }, "work-link")).toBe(true);
    expect(done({ ...EMPTY, portfolioUrl: "https://a.dev" }, "work-link")).toBe(true);
    expect(done({ ...EMPTY, linkedinUrl: "https://linkedin.com/in/a" }, "work-link")).toBe(true);
  });

  it("counts a rate when one is stated, including a low one", () => {
    expect(done(EMPTY, "rate")).toBe(false);
    expect(done({ ...EMPTY, hourlyRateUsd: 5 }, "rate")).toBe(true);
    // Zero is a stated rate, not an absent one — null is the only "unset".
    expect(done({ ...EMPTY, hourlyRateUsd: 0 }, "rate")).toBe(true);
  });

  it("counts a headline only once it says three words", () => {
    expect(done({ ...EMPTY, headline: "Developer" }, "headline")).toBe(false);
    expect(done({ ...EMPTY, headline: "Shopify developer" }, "headline")).toBe(false);
    expect(done({ ...EMPTY, headline: "Senior Shopify developer" }, "headline")).toBe(true);
    // Extra spacing does not manufacture words.
    expect(done({ ...EMPTY, headline: "  Shopify   developer  " }, "headline")).toBe(false);
  });

  it("counts verification on either a pending submission or a reviewer note", () => {
    expect(done(EMPTY, "verification")).toBe(false);
    expect(done({ ...EMPTY, verificationSubmittedAt: new Date() }, "verification")).toBe(true);
    expect(done({ ...EMPTY, verificationNote: "approved: github" }, "verification")).toBe(true);
  });
});

describe("profileStrength next step", () => {
  it("names the highest-weight incomplete item", () => {
    const next = profileStrength(EMPTY).next;
    expect(next?.weight).toBe(20);
    // Ties break by declaration order, which is the order the product wants
    // people to work in: the bio first.
    expect(next?.key).toBe("bio");
  });

  it("moves on as items are completed, always taking the biggest one left", () => {
    const withBio = { ...EMPTY, bio: "x".repeat(300) };
    expect(profileStrength(withBio).next?.key).toBe("skills");

    const withSkills = { ...withBio, skillCount: 5 };
    expect(profileStrength(withSkills).next?.key).toBe("work-link");

    const withLink = { ...withSkills, githubUrl: "https://github.com/a" };
    // Both 15-pointers are left; rate is declared first.
    expect(profileStrength(withLink).next?.key).toBe("rate");
    expect(profileStrength(withLink).next?.weight).toBe(15);

    const withRate = { ...withLink, hourlyRateUsd: 65 };
    expect(profileStrength(withRate).next?.key).toBe("headline");

    const withHeadline = { ...withRate, headline: "Senior Shopify developer" };
    // Only the 10-pointer remains.
    expect(profileStrength(withHeadline).next?.key).toBe("verification");
    expect(profileStrength(withHeadline).percent).toBe(90);
  });

  it("never skips a light item to reach a heavy done one", () => {
    // Everything heavy done, only the 10-point review outstanding.
    const strength = profileStrength({ ...COMPLETE, verificationSubmittedAt: null });
    expect(strength.next?.key).toBe("verification");
    expect(strength.percent).toBe(90);
  });

  it("returns a next item that is genuinely not done", () => {
    const strength = profileStrength({ ...EMPTY, skillCount: 5 });
    expect(strength.next?.done).toBe(false);
  });
});
