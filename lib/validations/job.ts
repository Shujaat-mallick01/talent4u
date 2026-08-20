import { z } from "zod";

/**
 * Job posting input. The server-trusted authority on a valid post — the form
 * mirrors these rules for UX only. Budget ordering, onsite-requires-location,
 * and non-negative budgets are ALSO enforced by database CHECK constraints;
 * this schema exists to give humans a field error instead of a 500.
 */

export const jobEngagementTypes = ["HOURLY", "FIXED", "PART_TIME", "FULL_TIME"] as const;

export const jobPostSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(10, "Give the job a descriptive title (at least 10 characters).")
      .max(90, "Keep the title under 90 characters."),
    description: z
      .string()
      .trim()
      .min(100, "Describe the work — at least 100 characters. Vague posts get vague applicants.")
      .max(10000, "That description is too long (max 10,000 characters)."),
    categorySlug: z.string().trim().min(1, "Pick a category."),
    engagementType: z.enum(jobEngagementTypes),
    budgetMinUsd: z
      .number({ error: "Enter a whole-dollar amount." })
      .int("Enter a whole-dollar amount.")
      .min(0, "Budget cannot be negative.")
      .max(1_000_000, "That budget looks too high.")
      .nullable()
      .default(null),
    budgetMaxUsd: z
      .number({ error: "Enter a whole-dollar amount." })
      .int("Enter a whole-dollar amount.")
      .min(0, "Budget cannot be negative.")
      .max(1_000_000, "That budget looks too high.")
      .nullable()
      .default(null),
    isRemote: z.boolean().default(true),
    location: z
      .string()
      .trim()
      .max(120, "Keep the location under 120 characters.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    skillSlugs: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid skill."),
      )
      .min(1, "Pick at least one skill.")
      .max(10, "Pick up to 10 skills.")
      .refine((s) => new Set(s).size === s.length, "You picked the same skill twice."),
  })
  .refine(
    (v) => v.budgetMinUsd === null || v.budgetMaxUsd === null || v.budgetMinUsd <= v.budgetMaxUsd,
    { message: "The minimum budget cannot exceed the maximum.", path: ["budgetMinUsd"] },
  )
  .refine((v) => v.isRemote || (v.location !== null && v.location.length > 0), {
    message: "On-site or hybrid roles must say where.",
    path: ["location"],
  });

export type JobPostInput = z.infer<typeof jobPostSchema>;
