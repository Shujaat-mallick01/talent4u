import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Shared slug helpers for public profile URLs (freelancers, companies).
 * Slugs only need to be URL-safe and unique; these functions are pure so both
 * profile services can reuse them and unit-test them without a database.
 */

/** Turns a name into a URL-safe slug base, never empty (uses `fallback`). */
export function slugify(name: string, fallback: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || fallback;
}

/**
 * The first free slug in the sequence base, base-2, base-3, … given the set
 * of slugs already taken for that base. Deterministic and gap-filling.
 */
export function pickAvailableSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Which unique constraint a P2002 fired on. Onboarding uses this to tell a
 * retryable slug race apart from a genuine "this account already onboarded"
 * (userId) conflict.
 */
export function conflictField(
  error: Prisma.PrismaClientKnownRequestError,
): "slug" | "userId" | "other" {
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (text.includes("slug")) return "slug";
  if (text.includes("userId")) return "userId";
  return "other";
}
