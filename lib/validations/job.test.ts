import { describe, expect, it } from "vitest";

import { jobPostSchema } from "./job";

const valid = () => ({
  title: "Senior Next.js developer for logistics portal rebuild",
  description:
    "We run a freight-forwarding operation and our customer portal has outgrown its original build. We need a senior developer to rebuild it on Next.js with Postgres, working with our in-house designer and one backend engineer.",
  categorySlug: "full-stack-web-development",
  engagementType: "FULL_TIME" as const,
  budgetMinUsd: 4000,
  budgetMaxUsd: 6500,
  isRemote: true,
  location: "",
  skillSlugs: ["nextjs", "typescript", "postgresql"],
});

describe("jobPostSchema", () => {
  it("accepts a valid remote post and nulls the empty location", () => {
    const parsed = jobPostSchema.safeParse(valid());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.location).toBeNull();
  });

  it("accepts an onsite post with a location", () => {
    const parsed = jobPostSchema.safeParse({
      ...valid(),
      isRemote: false,
      location: "Hamburg, Germany",
    });
    expect(parsed.success).toBe(true);
  });

  const rejects = (patch: Record<string, unknown>, field: string) => {
    const parsed = jobPostSchema.safeParse({ ...valid(), ...patch });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((i) => i.path[0] === field)).toBe(true);
  };

  it("rejects an onsite post without a location", () =>
    rejects({ isRemote: false, location: "" }, "location"));
  it("rejects an inverted budget range", () =>
    rejects({ budgetMinUsd: 900, budgetMaxUsd: 100 }, "budgetMinUsd"));
  it("rejects a negative budget", () => rejects({ budgetMinUsd: -5 }, "budgetMinUsd"));
  it("rejects a short title", () => rejects({ title: "Dev job" }, "title"));
  it("rejects a short description", () => rejects({ description: "Build a thing." }, "description"));
  it("rejects an empty skills list", () => rejects({ skillSlugs: [] }, "skillSlugs"));
  it("rejects duplicate skills", () =>
    rejects({ skillSlugs: ["nextjs", "nextjs"] }, "skillSlugs"));
  it("rejects more than 10 skills", () =>
    rejects({ skillSlugs: Array.from({ length: 11 }, (_, i) => `skill-${i}`) }, "skillSlugs"));
  it("allows a budget-less post", () => {
    const parsed = jobPostSchema.safeParse({ ...valid(), budgetMinUsd: null, budgetMaxUsd: null });
    expect(parsed.success).toBe(true);
  });
});
