import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  configured: vi.fn(() => true),
}));

vi.mock("@/lib/billing/stripe", () => ({
  stripeConfigured: stripeMocks.configured,
  getStripe: () => ({ subscriptions: { cancel: stripeMocks.cancel } }),
}));
vi.mock("@/lib/db/account-deletion", () => ({ anonymiseAccount: vi.fn() }));
vi.mock("@/lib/db/subscription", () => ({ getBillingState: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ getUserAuthState: vi.fn() }));
vi.mock("@/lib/storage/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/observability/report-error", () => ({ reportError: vi.fn() }));

import { anonymiseAccount } from "@/lib/db/account-deletion";
import { getBillingState } from "@/lib/db/subscription";
import { getUserAuthState } from "@/lib/db/users";
import { getSupabaseAdmin } from "@/lib/storage/supabase-admin";

import { deleteAccountForUser } from "./account-deletion";

const mockAuth = vi.mocked(getUserAuthState);
const mockBilling = vi.mocked(getBillingState);
const mockAnonymise = vi.mocked(anonymiseAccount);
const mockAdmin = vi.mocked(getSupabaseAdmin);

const USER = "00000000-0000-4000-8000-000000000001";
const EMAIL = "jane@example.com";

const deleteUser = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  stripeMocks.configured.mockReturnValue(true);
  stripeMocks.cancel.mockResolvedValue({});
  deleteUser.mockResolvedValue({ error: null });
  mockAdmin.mockReturnValue({ auth: { admin: { deleteUser } } } as never);
  mockAuth.mockResolvedValue({ id: USER, email: EMAIL, role: "FREELANCER", hasProfile: true } as never);
  mockBilling.mockResolvedValue({ subscription: null } as never);
  mockAnonymise.mockResolvedValue({ wasNamed: "Jane Cooper", hadSubscription: null });
});

describe("proving intent", () => {
  it("refuses when the typed address is not the account's", async () => {
    const result = await deleteAccountForUser(USER, "someone.else@example.com");
    expect(result).toEqual({ ok: false, reason: "confirmation-mismatch" });
    // Nothing at all should have happened.
    expect(mockAnonymise).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
  });

  it("accepts the address with different case and stray whitespace", async () => {
    // The point is to prove intent, not to test typing. Somebody copying
    // their own address out of the page above should not be defeated by it.
    const result = await deleteAccountForUser(USER, "  JANE@Example.com  ");
    expect(result.ok).toBe(true);
  });

  it("refuses an account that does not exist", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await deleteAccountForUser(USER, EMAIL)).toEqual({ ok: false, reason: "no-account" });
  });
});

describe("stopping the money first", () => {
  it("cancels a live subscription before touching anything else", async () => {
    const order: string[] = [];
    mockBilling.mockResolvedValue({
      subscription: { stripeSubscriptionId: "sub_1", status: "ACTIVE" },
    } as never);
    stripeMocks.cancel.mockImplementation(async () => {
      order.push("cancel");
      return {};
    });
    mockAnonymise.mockImplementation(async () => {
      order.push("anonymise");
      return { wasNamed: "Jane", hadSubscription: "sub_1" };
    });
    deleteUser.mockImplementation(async () => {
      order.push("delete-auth");
      return { error: null };
    });

    await deleteAccountForUser(USER, EMAIL);

    expect(order).toEqual(["cancel", "anonymise", "delete-auth"]);
  });

  it("stops entirely when Stripe cannot be reached", async () => {
    mockBilling.mockResolvedValue({
      subscription: { stripeSubscriptionId: "sub_1", status: "ACTIVE" },
    } as never);
    stripeMocks.cancel.mockRejectedValue(new Error("network down"));

    const result = await deleteAccountForUser(USER, EMAIL);

    // The one outcome nobody would forgive is an account that no longer
    // exists still being charged. Nothing is deleted.
    expect(result).toEqual({ ok: false, reason: "billing-unreachable" });
    expect(mockAnonymise).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses if billing is not configured but a subscription exists", async () => {
    stripeMocks.configured.mockReturnValue(false);
    mockBilling.mockResolvedValue({
      subscription: { stripeSubscriptionId: "sub_1", status: "ACTIVE" },
    } as never);

    expect(await deleteAccountForUser(USER, EMAIL)).toEqual({
      ok: false,
      reason: "billing-unreachable",
    });
    expect(mockAnonymise).not.toHaveBeenCalled();
  });

  it("treats a subscription Stripe has already lost as already cancelled", async () => {
    mockBilling.mockResolvedValue({
      subscription: { stripeSubscriptionId: "sub_gone", status: "ACTIVE" },
    } as never);
    stripeMocks.cancel.mockRejectedValue(new Error("No such subscription: sub_gone"));

    // Already gone is the state we wanted, so the deletion proceeds.
    const result = await deleteAccountForUser(USER, EMAIL);
    expect(result.ok).toBe(true);
    expect(mockAnonymise).toHaveBeenCalledOnce();
  });

  it("does not call Stripe at all for an already-cancelled subscription", async () => {
    mockBilling.mockResolvedValue({
      subscription: { stripeSubscriptionId: "sub_1", status: "CANCELED" },
    } as never);
    await deleteAccountForUser(USER, EMAIL);
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
  });
});

describe("when a later step fails", () => {
  it("reports failure and changes nothing if anonymising throws", async () => {
    mockAnonymise.mockRejectedValue(new Error("deadlock"));
    expect(await deleteAccountForUser(USER, EMAIL)).toEqual({ ok: false, reason: "failed" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("still reports success if only the Auth deletion fails", async () => {
    deleteUser.mockResolvedValue({ error: { message: "auth unavailable" } });

    // By this point the account is anonymised and flagged deleted, which every
    // authenticated lookup refuses — the person is out either way. Telling
    // them "partly deleted" would alarm them about something they cannot see
    // and cannot act on; what is left is an operator tidy-up.
    const result = await deleteAccountForUser(USER, EMAIL);
    expect(result).toEqual({ ok: true, wasNamed: "Jane Cooper" });
  });
});
