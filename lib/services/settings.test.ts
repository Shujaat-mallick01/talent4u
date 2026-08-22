import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/settings", () => ({
  getAccountSettingsRow: vi.fn(),
  updateBillingCountry: vi.fn(),
  setFreelancerDeactivated: vi.fn(),
  setRecruiterDeactivated: vi.fn(),
}));

import {
  getAccountSettingsRow,
  setFreelancerDeactivated,
  setRecruiterDeactivated,
  updateBillingCountry,
  type AccountSettingsRow,
} from "@/lib/db/settings";

import {
  changePassword,
  getSettingsViewForUser,
  setBillingCountryForUser,
  setProfileVisibilityForUser,
} from "./settings";

const mockRow = vi.mocked(getAccountSettingsRow);
const mockCountry = vi.mocked(updateBillingCountry);
const mockFreelancerVisibility = vi.mocked(setFreelancerDeactivated);
const mockRecruiterVisibility = vi.mocked(setRecruiterDeactivated);

const USER_ID = "00000000-0000-4000-8000-000000000001";
const DEACTIVATED_AT = new Date("2026-05-01T10:00:00Z");

const freelancerRow = (over: Partial<AccountSettingsRow> = {}): AccountSettingsRow => ({
  id: USER_ID,
  email: "jane@example.com",
  emailVerified: new Date("2026-01-01T00:00:00Z"),
  role: "FREELANCER",
  billingCountry: "PK",
  freelancer: {
    id: "fp_1",
    slug: "jane-cooper",
    displayName: "Jane Cooper",
    deactivatedAt: null,
  },
  recruiter: null,
  ...over,
});

const recruiterRow = (
  over: Partial<AccountSettingsRow> = {},
  recruiterOver: Partial<NonNullable<AccountSettingsRow["recruiter"]>> = {},
): AccountSettingsRow => ({
  id: USER_ID,
  email: "ops@acme.com",
  emailVerified: new Date("2026-01-01T00:00:00Z"),
  role: "RECRUITER",
  billingCountry: "GB",
  freelancer: null,
  recruiter: {
    id: "rp_1",
    slug: "acme",
    companyName: "Acme",
    deactivatedAt: null,
    isBanned: false,
    _count: { jobs: 2 },
    ...recruiterOver,
  },
  ...over,
});

beforeEach(() => vi.resetAllMocks());

// ── Password ───────────────────────────────────────────────────────────────

describe("changePassword", () => {
  it("rejects a mismatched confirmation before touching Supabase", async () => {
    const update = vi.fn();
    expect(await changePassword({ password: "correct-horse", confirm: "correcthorse" }, update)).toEqual(
      { ok: false, reason: "password-mismatch" },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a password under 8 characters", async () => {
    const update = vi.fn();
    expect(await changePassword({ password: "short7!", confirm: "short7!" }, update)).toEqual({
      ok: false,
      reason: "password-too-short",
    });
    expect(update).not.toHaveBeenCalled();
  });

  // The browser's minLength is not a check. A curl POST reaches the same code.
  it("rejects non-string input from a hand-rolled request", async () => {
    const update = vi.fn();
    expect(await changePassword({ password: undefined, confirm: undefined }, update)).toEqual({
      ok: false,
      reason: "password-too-short",
    });
    expect(await changePassword({ password: 12345678, confirm: 12345678 }, update)).toEqual({
      ok: false,
      reason: "password-too-short",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("passes the new password through once when both fields agree", async () => {
    const update = vi.fn().mockResolvedValue(true);
    expect(
      await changePassword({ password: "correct-horse", confirm: "correct-horse" }, update),
    ).toEqual({ ok: true });
    expect(update).toHaveBeenCalledExactlyOnceWith("correct-horse");
  });

  it("reports a failed update rather than claiming success", async () => {
    const update = vi.fn().mockResolvedValue(false);
    expect(
      await changePassword({ password: "correct-horse", confirm: "correct-horse" }, update),
    ).toEqual({ ok: false, reason: "update-failed" });
  });

  // A password of exactly 8 is the boundary the copy promises.
  it("accepts exactly the minimum length", async () => {
    const update = vi.fn().mockResolvedValue(true);
    expect(await changePassword({ password: "12345678", confirm: "12345678" }, update)).toEqual({
      ok: true,
    });
  });
});

// ── Billing country ────────────────────────────────────────────────────────

describe("setBillingCountryForUser", () => {
  it("writes a real ISO code from the list", async () => {
    mockCountry.mockResolvedValue(true);
    expect(await setBillingCountryForUser(USER_ID, { country: "PK" })).toEqual({
      ok: true,
      country: "PK",
    });
    expect(mockCountry).toHaveBeenCalledExactlyOnceWith(USER_ID, "PK");
  });

  it("normalizes case and surrounding space", async () => {
    mockCountry.mockResolvedValue(true);
    expect(await setBillingCountryForUser(USER_ID, { country: "  gb " })).toEqual({
      ok: true,
      country: "GB",
    });
    expect(mockCountry).toHaveBeenCalledExactlyOnceWith(USER_ID, "GB");
  });

  // The band table falls back to STANDARD for anything it does not know, so an
  // unvalidated country would quietly become a pricing decision.
  it("refuses a code that is not in the countries list, without writing", async () => {
    for (const country of ["ZZ", "XX", "", "  ", "PAKISTAN", "P", "PKK", "US;DROP"]) {
      expect(await setBillingCountryForUser(USER_ID, { country })).toEqual({
        ok: false,
        reason: "invalid-country",
      });
    }
    expect(mockCountry).not.toHaveBeenCalled();
  });

  it("refuses a non-string country", async () => {
    expect(await setBillingCountryForUser(USER_ID, { country: null })).toEqual({
      ok: false,
      reason: "invalid-country",
    });
    expect(await setBillingCountryForUser(USER_ID, { country: ["PK"] })).toEqual({
      ok: false,
      reason: "invalid-country",
    });
    expect(mockCountry).not.toHaveBeenCalled();
  });

  it("reports no-account when the update matched nothing", async () => {
    mockCountry.mockResolvedValue(false);
    expect(await setBillingCountryForUser(USER_ID, { country: "PK" })).toEqual({
      ok: false,
      reason: "no-account",
    });
  });
});

// ── Public profile visibility ──────────────────────────────────────────────

describe("setProfileVisibilityForUser — freelancer", () => {
  it("deactivates a live profile", async () => {
    mockRow.mockResolvedValue(freelancerRow());
    mockFreelancerVisibility.mockResolvedValue(true);

    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: true,
      deactivated: true,
      changed: true,
    });
    const [userId, at] = mockFreelancerVisibility.mock.calls[0];
    expect(userId).toBe(USER_ID);
    expect(at).toBeInstanceOf(Date);
  });

  // Idempotent: a double submit must not move the timestamp, and must not
  // report an error for a state the person already asked for.
  it("is idempotent when already deactivated", async () => {
    mockRow.mockResolvedValue(
      freelancerRow({
        freelancer: {
          id: "fp_1",
          slug: "jane-cooper",
          displayName: "Jane Cooper",
          deactivatedAt: DEACTIVATED_AT,
        },
      }),
    );

    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: true,
      deactivated: true,
      changed: false,
    });
    expect(mockFreelancerVisibility).not.toHaveBeenCalled();
  });

  it("reactivates a deactivated profile by clearing the timestamp", async () => {
    mockRow.mockResolvedValue(
      freelancerRow({
        freelancer: {
          id: "fp_1",
          slug: "jane-cooper",
          displayName: "Jane Cooper",
          deactivatedAt: DEACTIVATED_AT,
        },
      }),
    );
    mockFreelancerVisibility.mockResolvedValue(true);

    expect(await setProfileVisibilityForUser(USER_ID, { action: "reactivate" })).toEqual({
      ok: true,
      deactivated: false,
      changed: true,
    });
    expect(mockFreelancerVisibility).toHaveBeenCalledExactlyOnceWith(USER_ID, null);
  });

  it("is idempotent when already live", async () => {
    mockRow.mockResolvedValue(freelancerRow());

    expect(await setProfileVisibilityForUser(USER_ID, { action: "reactivate" })).toEqual({
      ok: true,
      deactivated: false,
      changed: false,
    });
    expect(mockFreelancerVisibility).not.toHaveBeenCalled();
  });

  it("reports no-profile when onboarding never finished", async () => {
    mockRow.mockResolvedValue(freelancerRow({ freelancer: null }));
    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: false,
      reason: "no-profile",
    });
    expect(mockFreelancerVisibility).not.toHaveBeenCalled();
  });
});

describe("setProfileVisibilityForUser — recruiter", () => {
  it("deactivates and reactivates a company page", async () => {
    mockRow.mockResolvedValue(recruiterRow());
    mockRecruiterVisibility.mockResolvedValue(true);
    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: true,
      deactivated: true,
      changed: true,
    });

    mockRow.mockResolvedValue(recruiterRow({}, { deactivatedAt: DEACTIVATED_AT }));
    expect(await setProfileVisibilityForUser(USER_ID, { action: "reactivate" })).toEqual({
      ok: true,
      deactivated: false,
      changed: true,
    });
    expect(mockRecruiterVisibility).toHaveBeenLastCalledWith(USER_ID, null);
  });

  it("is idempotent in both directions", async () => {
    mockRow.mockResolvedValue(recruiterRow({}, { deactivatedAt: DEACTIVATED_AT }));
    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: true,
      deactivated: true,
      changed: false,
    });

    mockRow.mockResolvedValue(recruiterRow());
    expect(await setProfileVisibilityForUser(USER_ID, { action: "reactivate" })).toEqual({
      ok: true,
      deactivated: false,
      changed: false,
    });
    expect(mockRecruiterVisibility).not.toHaveBeenCalled();
  });

  /**
   * The rule that matters most on this screen: a ban is a moderator's fact
   * about an employer, and no self-service path may undo it. isBanned wins
   * whether or not deactivatedAt happens to be null.
   */
  it("refuses to reactivate a banned company that had deactivated itself", async () => {
    mockRow.mockResolvedValue(
      recruiterRow({}, { isBanned: true, deactivatedAt: DEACTIVATED_AT }),
    );
    expect(await setProfileVisibilityForUser(USER_ID, { action: "reactivate" })).toEqual({
      ok: false,
      reason: "banned",
    });
    expect(mockRecruiterVisibility).not.toHaveBeenCalled();
  });

  it("refuses to reactivate a banned company whose deactivatedAt is already null", async () => {
    mockRow.mockResolvedValue(recruiterRow({}, { isBanned: true, deactivatedAt: null }));
    expect(await setProfileVisibilityForUser(USER_ID, { action: "reactivate" })).toEqual({
      ok: false,
      reason: "banned",
    });
    expect(mockRecruiterVisibility).not.toHaveBeenCalled();
  });

  // Hiding further is never the dangerous direction, so a banned company may
  // still take its own page down.
  it("still lets a banned company deactivate", async () => {
    mockRow.mockResolvedValue(recruiterRow({}, { isBanned: true, deactivatedAt: null }));
    mockRecruiterVisibility.mockResolvedValue(true);
    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: true,
      deactivated: true,
      changed: true,
    });
  });
});

describe("setProfileVisibilityForUser — bad callers", () => {
  it("refuses an action it does not recognise, without reading the account", async () => {
    for (const action of ["delete", "", null, undefined, "DEACTIVATE"]) {
      expect(await setProfileVisibilityForUser(USER_ID, { action })).toEqual({
        ok: false,
        reason: "invalid-action",
      });
    }
    expect(mockRow).not.toHaveBeenCalled();
  });

  it("refuses when there is no account", async () => {
    mockRow.mockResolvedValue(null);
    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: false,
      reason: "no-account",
    });
  });

  it("refuses an admin — there is no public page to hide", async () => {
    mockRow.mockResolvedValue(
      freelancerRow({ role: "ADMIN", freelancer: null, recruiter: null }),
    );
    expect(await setProfileVisibilityForUser(USER_ID, { action: "deactivate" })).toEqual({
      ok: false,
      reason: "no-profile",
    });
  });
});

// ── The view model ─────────────────────────────────────────────────────────

describe("getSettingsViewForUser", () => {
  it("resolves the freelancer's band and price from their billing country", async () => {
    mockRow.mockResolvedValue(freelancerRow()); // PK -> LOW band
    const result = await getSettingsViewForUser(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.view.band).toBe("LOW");
    expect(result.view.bandLabel).toBe("Regional");
    expect(result.view.billingCountryName).toBe("Pakistan");
    expect(result.view.paidPlanName).toBe("Pro");
    expect(result.view.paidPlanIsReduced).toBe(true);
    // Read from lib/pricing, never written in a component.
    expect(result.view.paidPlanMonthly).toBe("$3/mo");
    expect(result.view.paidPlanListMonthly).toBe("$6/mo");
    expect(result.view.profile).toEqual({
      slug: "jane-cooper",
      name: "Jane Cooper",
      publicPath: "/freelancers/jane-cooper",
      deactivated: false,
    });
    expect(result.view.isBanned).toBe(false);
    expect(result.view.activeJobCount).toBe(0);
  });

  it("gives a recruiter their company page, ban flag and open post count", async () => {
    mockRow.mockResolvedValue(recruiterRow({}, { deactivatedAt: DEACTIVATED_AT, _count: { jobs: 3 } }));
    const result = await getSettingsViewForUser(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.view.band).toBe("STANDARD"); // GB
    expect(result.view.paidPlanName).toBe("Growth");
    expect(result.view.paidPlanMonthly).toBe("$79/mo");
    expect(result.view.paidPlanIsReduced).toBe(false);
    expect(result.view.profile.publicPath).toBe("/companies/acme");
    expect(result.view.profile.deactivated).toBe(true);
    // Deactivating does not close posts, so the screen has a real number to
    // put next to the link that does.
    expect(result.view.activeJobCount).toBe(3);
  });

  it("falls back to the standard band when no country is set", async () => {
    mockRow.mockResolvedValue(freelancerRow({ billingCountry: null }));
    const result = await getSettingsViewForUser(USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.band).toBe("STANDARD");
    expect(result.view.billingCountryName).toBeNull();
    expect(result.view.paidPlanMonthly).toBe("$6/mo");
  });

  it("reports no-account and no-profile rather than rendering a blank screen", async () => {
    mockRow.mockResolvedValue(null);
    expect(await getSettingsViewForUser(USER_ID)).toEqual({ ok: false, reason: "no-account" });

    mockRow.mockResolvedValue(freelancerRow({ freelancer: null }));
    expect(await getSettingsViewForUser(USER_ID)).toEqual({ ok: false, reason: "no-profile" });

    mockRow.mockResolvedValue(freelancerRow({ role: "ADMIN", freelancer: null }));
    expect(await getSettingsViewForUser(USER_ID)).toEqual({ ok: false, reason: "no-profile" });
  });
});
