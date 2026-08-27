import {
  getAccountSettingsRow,
  setFreelancerDeactivated,
  setRecruiterDeactivated,
  updateBillingCountry,
} from "@/lib/db/settings";
import { countryName } from "@/lib/geo/countries";
import { BAND_SPECS, bandForCountry, type PriceBand } from "@/lib/pricing/bands";
import { PLAN_COPY } from "@/lib/pricing/catalogue";
import { formatMonthly, listPriceFor, priceForCountry } from "@/lib/pricing/prices";
import {
  billingCountrySchema,
  changePasswordSchema,
  jobDigestSchema,
  profileVisibilitySchema,
} from "@/lib/validations/settings";
import { setJobDigestOptIn } from "@/lib/db/digest";

/**
 * Account settings business logic.
 *
 * Three things live here rather than in the page or the actions:
 *
 * 1. Validation. Every entry point parses its own input with Zod, so "the
 *    form only offered real countries" is never the reason a value is safe.
 * 2. The visibility rules. Deactivation is idempotent, and a banned recruiter
 *    cannot reactivate — isBanned outranks deactivatedAt being null, because a
 *    ban is a moderator's fact about an employer and self-service must not be
 *    able to undo it.
 * 3. Price-band resolution for the screen, so the component never computes a
 *    price itself (CLAUDE.md: read from the pricing config, never hardcode).
 *
 * Account DELETION is deliberately absent. It needs a cascade design across
 * applications, engagements, threads and reviews — records that are shared
 * history with another person — plus a Supabase admin call we do not make
 * anywhere yet. The screen says so instead of pretending the button is coming.
 */

export type SettingsProfileView = {
  slug: string;
  /** Display name or company name — whatever their public page is titled. */
  name: string;
  /** The public page this visibility switch controls. */
  publicPath: string;
  deactivated: boolean;
};

export type SettingsView = {
  email: string;
  emailVerified: boolean;
  role: "FREELANCER" | "RECRUITER";
  billingCountry: string | null;
  billingCountryName: string | null;
  band: PriceBand;
  bandLabel: string;
  bandNote: string;
  /** The paid plan this role would buy, priced for their band. */
  paidPlanName: string;
  paidPlanMonthly: string;
  /** The same plan at list price, for a "normally X" comparison. */
  paidPlanListMonthly: string;
  paidPlanIsReduced: boolean;
  profile: SettingsProfileView;
  /** Recruiters only: a ban is not a deactivation and is not theirs to lift. */
  isBanned: boolean;
  /** Recruiters only: posts that stay open when the company page comes down. */
  activeJobCount: number;
  /**
   * Freelancers only. The one piece of mail the product sends that nobody
   * asked for at the moment it arrives, and therefore the one with a switch.
   */
  jobDigestOptIn: boolean;
};

export type SettingsViewResult =
  | { ok: true; view: SettingsView }
  | { ok: false; reason: "no-account" | "no-profile" };

/** Everything the settings screen renders, resolved server-side in one read. */
export async function getSettingsViewForUser(userId: string): Promise<SettingsViewResult> {
  const row = await getAccountSettingsRow(userId);
  if (!row) return { ok: false, reason: "no-account" };

  // An admin has no profile and no public page, so there is no settings screen
  // for them — nothing on it would be about anything they own.
  const profile =
    row.role === "FREELANCER" && row.freelancer
      ? {
          slug: row.freelancer.slug,
          name: row.freelancer.displayName,
          publicPath: `/freelancers/${row.freelancer.slug}`,
          deactivated: row.freelancer.deactivatedAt !== null,
        }
      : row.role === "RECRUITER" && row.recruiter
        ? {
            slug: row.recruiter.slug,
            name: row.recruiter.companyName,
            publicPath: `/companies/${row.recruiter.slug}`,
            deactivated: row.recruiter.deactivatedAt !== null,
          }
        : null;
  if (!profile || (row.role !== "FREELANCER" && row.role !== "RECRUITER")) {
    return { ok: false, reason: "no-profile" };
  }

  const band = bandForCountry(row.billingCountry);
  const spec = BAND_SPECS[band];
  const plan = row.role === "RECRUITER" ? "RECRUITER_GROWTH" : "FREELANCER_PRO";
  const price = priceForCountry(plan, row.billingCountry);

  return {
    ok: true,
    view: {
      email: row.email,
      emailVerified: row.emailVerified !== null,
      role: row.role,
      billingCountry: row.billingCountry,
      billingCountryName: row.billingCountry ? countryName(row.billingCountry) : null,
      band,
      bandLabel: spec.label,
      bandNote: spec.note,
      paidPlanName: PLAN_COPY[plan].name,
      paidPlanMonthly: formatMonthly(price),
      paidPlanListMonthly: formatMonthly(listPriceFor(plan)),
      paidPlanIsReduced: price.isReduced,
      profile,
      isBanned: row.recruiter?.isBanned ?? false,
      activeJobCount: row.recruiter?._count.jobs ?? 0,
      jobDigestOptIn: row.jobDigestOptIn,
    },
  };
}

// ── Password ───────────────────────────────────────────────────────────────

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "password-mismatch" | "password-too-short" | "update-failed" };

/**
 * Applies a new password.
 *
 * The Supabase call is injected rather than imported so this rule is testable
 * without a request scope: `lib/auth/supabase.ts` reads cookies() and throws at
 * import time without env, and neither of those has anything to do with
 * "a mismatched confirmation is refused".
 *
 * There is no authorization check here on purpose — the injected updater acts
 * on the caller's own session and can only ever change that account's password.
 * The action still calls requireUser first, so an anonymous POST never arrives.
 */
export async function changePassword(
  raw: { password: unknown; confirm: unknown },
  updatePassword: (password: string) => Promise<boolean>,
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    // Name the actual problem: "check your input" on a password form means
    // re-typing both fields to discover which one was wrong. The password
    // field is reported first when both are wrong — a too-short password is
    // the more fundamental of the two, and "they don't match" would send
    // someone off retyping a password that would be refused anyway.
    const badPassword = parsed.error.issues.some((i) => i.path[0] === "password");
    return { ok: false, reason: badPassword ? "password-too-short" : "password-mismatch" };
  }

  const updated = await updatePassword(parsed.data.password);
  return updated ? { ok: true } : { ok: false, reason: "update-failed" };
}

// ── Billing country ────────────────────────────────────────────────────────

export type BillingCountryResult =
  | { ok: true; country: string }
  | { ok: false; reason: "invalid-country" | "no-account" };

/**
 * Sets the billing country regional pricing resolves from. Checked again at
 * checkout — this is the stored preference, not a price lock.
 */
export async function setBillingCountryForUser(
  userId: string,
  raw: { country: unknown },
): Promise<BillingCountryResult> {
  const parsed = billingCountrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid-country" };

  const written = await updateBillingCountry(userId, parsed.data.country);
  return written ? { ok: true, country: parsed.data.country } : { ok: false, reason: "no-account" };
}

// ── Public profile visibility ──────────────────────────────────────────────

export type VisibilityResult =
  | { ok: true; deactivated: boolean; changed: boolean }
  | { ok: false; reason: "invalid-action" | "no-account" | "no-profile" | "banned" };

/**
 * Takes the public page down, or puts it back up.
 *
 * What this is NOT: a delete, a suspension, or a way out of the product.
 * Applications, engagements, message threads and reviews are shared history
 * with other people and stay exactly as they are; the person keeps full use of
 * the product while deactivated. Only the public surface changes.
 *
 * Idempotent in both directions: asking for a state you are already in is a
 * success with `changed: false`, never an error and never a second timestamp.
 */
export async function setProfileVisibilityForUser(
  userId: string,
  raw: { action: unknown },
): Promise<VisibilityResult> {
  const parsed = profileVisibilitySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid-action" };
  const deactivating = parsed.data.action === "deactivate";

  const row = await getAccountSettingsRow(userId);
  if (!row) return { ok: false, reason: "no-account" };

  if (row.role === "FREELANCER") {
    if (!row.freelancer) return { ok: false, reason: "no-profile" };
    const already = (row.freelancer.deactivatedAt !== null) === deactivating;
    if (already) return { ok: true, deactivated: deactivating, changed: false };
    const changed = await setFreelancerDeactivated(userId, deactivating ? new Date() : null);
    return { ok: true, deactivated: deactivating, changed };
  }

  if (row.role === "RECRUITER") {
    if (!row.recruiter) return { ok: false, reason: "no-profile" };
    // The ban outranks everything below it. A removed employer's page is gone
    // because a moderator removed it, so clearing deactivatedAt — whether it
    // is set or not — never restores them, and saying "done" would be a lie.
    if (row.recruiter.isBanned && !deactivating) return { ok: false, reason: "banned" };
    const already = (row.recruiter.deactivatedAt !== null) === deactivating;
    if (already) return { ok: true, deactivated: deactivating, changed: false };
    const changed = await setRecruiterDeactivated(userId, deactivating ? new Date() : null);
    return { ok: true, deactivated: deactivating, changed };
  }

  // ADMIN: no profile concept, so no public page to hide.
  return { ok: false, reason: "no-profile" };
}

export type JobDigestResult =
  | { ok: true; optIn: boolean }
  | { ok: false; reason: "no-account" | "not-a-freelancer" };

/**
 * Turns the weekly job digest on or off.
 *
 * Freelancers only — it is a digest of jobs, and a recruiter has no use for
 * one. Refused for anyone else rather than silently written, so a stray POST
 * cannot leave a flag set on an account that will never act on it.
 *
 * Idempotent: setting the state you are already in is a success. People land
 * here from the unsubscribe page as often as from the settings screen.
 */
export async function setJobDigestForUser(
  userId: string,
  raw: { optIn: unknown },
): Promise<JobDigestResult> {
  const parsed = jobDigestSchema.safeParse(raw);
  // A checkbox posts nothing when unchecked, so a parse failure here means a
  // malformed value, not an absent one.
  const optIn = parsed.success ? parsed.data.optIn === "on" : false;

  const row = await getAccountSettingsRow(userId);
  if (!row) return { ok: false, reason: "no-account" };
  if (row.role !== "FREELANCER") return { ok: false, reason: "not-a-freelancer" };

  await setJobDigestOptIn(userId, optIn);
  return { ok: true, optIn };
}
