import { createHash } from "node:crypto";

/**
 * Deterministic identifiers for seed data.
 *
 * The seed must be safe to re-run, so every row needs a stable key. Rows with a
 * natural key (categories, skills, profiles, jobs) upsert on their slug. Rows
 * without one (applications, engagements, reviews, conversations) get an id
 * derived here from a namespace plus a caller-supplied key, so the same input
 * always produces the same row rather than a duplicate.
 */

const digest = (namespace: string, key: string): string =>
  createHash("sha256").update(`talent4u:${namespace}:${key}`).digest("hex");

/**
 * A stable cuid-shaped id. Not a real cuid, but the column is a plain String
 * and only uniqueness and determinism matter.
 */
export const stableId = (namespace: string, key: string): string =>
  `seed${digest(namespace, key).slice(0, 21)}`;

/**
 * A stable RFC-4122-shaped UUID, for User.id.
 *
 * User.id is `@db.Uuid` because it mirrors Supabase Auth's auth.users.id, so
 * seeded users need syntactically valid UUIDs. Version and variant nibbles are
 * forced so Postgres accepts them. These users do not exist in Supabase Auth
 * and cannot sign in — they are display data. Create real accounts through the
 * signup flow.
 */
export const stableUuid = (namespace: string, key: string): string => {
  const hex = digest(namespace, key);
  const version = "4";
  // 8, 9, a or b — the RFC-4122 variant bits.
  const variant = "89ab"[parseInt(hex[16], 16) % 4];

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    version + hex.slice(13, 16),
    variant + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
};

/** Hours before the seed's reference time. */
export const hoursAgo = (now: Date, hours: number): Date =>
  new Date(now.getTime() - hours * 60 * 60 * 1000);

/** Days before the seed's reference time. */
export const daysAgo = (now: Date, days: number): Date =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
