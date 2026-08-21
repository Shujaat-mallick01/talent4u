import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/moderation", () => ({
  banRecruiterTx: vi.fn(),
  clearFlagTx: vi.fn(),
  upholdFlagTx: vi.fn(),
  resolveReport: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getUserAuthState: vi.fn() }));

import { banRecruiterTx, clearFlagTx, resolveReport, upholdFlagTx } from "@/lib/db/moderation";
import { getUserAuthState } from "@/lib/db/users";

import {
  banRecruiterAsAdmin,
  clearFlagAsAdmin,
  resolveReportAsAdmin,
  upholdFlagAsAdmin,
} from "./moderation";

const mockAuth = vi.mocked(getUserAuthState);
const mockClear = vi.mocked(clearFlagTx);
const mockUphold = vi.mocked(upholdFlagTx);
const mockBan = vi.mocked(banRecruiterTx);
const mockReport = vi.mocked(resolveReport);

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";

const account = (role: "ADMIN" | "RECRUITER" | "FREELANCER", id = OTHER) =>
  ({ id, email: "x@y.test", role, hasProfile: true }) as NonNullable<
    Awaited<ReturnType<typeof getUserAuthState>>
  >;

beforeEach(() => vi.resetAllMocks());

describe("every moderation action requires a real ADMIN", () => {
  const nonAdmins = ["RECRUITER", "FREELANCER"] as const;

  it("refuses non-admin roles and never touches the database", async () => {
    for (const role of nonAdmins) {
      mockAuth.mockResolvedValue(account(role));
      expect(await clearFlagAsAdmin(OTHER, "flag1")).toEqual({ ok: false, reason: "not-admin" });
      expect(await upholdFlagAsAdmin(OTHER, "flag1")).toEqual({ ok: false, reason: "not-admin" });
      expect(await banRecruiterAsAdmin(OTHER, "rec1", "scam")).toEqual({
        ok: false,
        reason: "not-admin",
      });
      expect(await resolveReportAsAdmin(OTHER, "rep1", "UPHELD")).toEqual({
        ok: false,
        reason: "not-admin",
      });
    }
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockUphold).not.toHaveBeenCalled();
    expect(mockBan).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("refuses a caller with no account row at all", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await clearFlagAsAdmin(OTHER, "flag1")).toEqual({ ok: false, reason: "not-admin" });
    expect(mockClear).not.toHaveBeenCalled();
  });
});

describe("admin decisions reach the database", () => {
  beforeEach(() => mockAuth.mockResolvedValue(account("ADMIN", ADMIN)));

  it("clears a flag and reports whether the held job went live", async () => {
    mockClear.mockResolvedValue({ ok: true, jobPublished: true });
    expect(await clearFlagAsAdmin(ADMIN, "flag1")).toEqual({ ok: true, jobPublished: true });
    // The reviewer's id is recorded on the flag.
    expect(mockClear).toHaveBeenCalledWith("flag1", ADMIN);
  });

  it("does not claim publication when a sibling flag still holds the job", async () => {
    mockClear.mockResolvedValue({ ok: true, jobPublished: false });
    expect(await clearFlagAsAdmin(ADMIN, "flag1")).toEqual({ ok: true, jobPublished: false });
  });

  it("upholds a flag", async () => {
    mockUphold.mockResolvedValue({ ok: true, jobPublished: false });
    expect(await upholdFlagAsAdmin(ADMIN, "flag1")).toEqual({ ok: true, jobPublished: false });
    expect(mockUphold).toHaveBeenCalledWith("flag1", ADMIN);
  });

  it("bans a recruiter with the public reason and reports posts removed", async () => {
    mockBan.mockResolvedValue({ ok: true, jobsRemoved: 3 });
    expect(await banRecruiterAsAdmin(ADMIN, "rec1", "Demanded a deposit from applicants.")).toEqual(
      { ok: true, jobsRemoved: 3 },
    );
    expect(mockBan).toHaveBeenCalledWith({
      recruiterId: "rec1",
      reason: "Demanded a deposit from applicants.",
      adminUserId: ADMIN,
    });
  });

  it("does not re-ban an already-banned recruiter", async () => {
    mockBan.mockResolvedValue({ ok: false, reason: "already-banned" });
    expect(await banRecruiterAsAdmin(ADMIN, "rec1", "Again.")).toEqual({
      ok: false,
      reason: "already-banned",
    });
  });

  it("passes the report decision through verbatim", async () => {
    mockReport.mockResolvedValue(true);
    expect(await resolveReportAsAdmin(ADMIN, "rep1", "UPHELD")).toEqual({ ok: true });
    expect(mockReport).toHaveBeenCalledWith("rep1", "UPHELD");

    await resolveReportAsAdmin(ADMIN, "rep2", "CLEARED");
    expect(mockReport).toHaveBeenLastCalledWith("rep2", "CLEARED");
  });

  it("surfaces an already-handled decision instead of pretending it worked", async () => {
    mockClear.mockResolvedValue({ ok: false, reason: "not-open" });
    expect(await clearFlagAsAdmin(ADMIN, "flag1")).toEqual({ ok: false, reason: "not-open" });

    mockReport.mockResolvedValue(false);
    expect(await resolveReportAsAdmin(ADMIN, "rep1", "CLEARED")).toEqual({
      ok: false,
      reason: "not-open",
    });
  });
});
