import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/report", () => ({
  countOpenReportsForUser: vi.fn(),
  createReportTx: vi.fn(),
  getReportableCompany: vi.fn(),
  getReportableJob: vi.fn(),
  hasOpenReportForTarget: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { submitReport } from "@/app/report/actions";
import {
  countOpenReportsForUser,
  createReportTx,
  getReportableCompany,
  getReportableJob,
  hasOpenReportForTarget,
} from "@/lib/db/report";
import { requireUser } from "@/lib/auth/guards";
import type { ReportInput } from "@/lib/validations/report";

import { createReportForUser, MAX_OPEN_REPORTS_PER_USER } from "./report";

const mockJob = vi.mocked(getReportableJob);
const mockCompany = vi.mocked(getReportableCompany);
const mockCount = vi.mocked(countOpenReportsForUser);
const mockDuplicate = vi.mocked(hasOpenReportForTarget);
const mockCreate = vi.mocked(createReportTx);
const mockRequireUser = vi.mocked(requireUser);

const USER = "00000000-0000-4000-8000-00000000u001";
const JOB_ID = "job1";
const COMPANY_ID = "rec1";

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  targetType: "job",
  targetId: JOB_ID,
  reason: "asked-for-payment",
  ...over,
});

/** The reporter's redirect target, extracted from the thrown redirect. */
const redirectedTo = async (fn: () => Promise<void>): Promise<string> => {
  try {
    await fn();
  } catch (error) {
    return String((error as Error).message).replace("REDIRECT:", "");
  }
  throw new Error("expected a redirect");
};

const form = (fields: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.resetAllMocks();
  mockJob.mockResolvedValue({ id: JOB_ID });
  mockCompany.mockResolvedValue({ id: COMPANY_ID });
  mockDuplicate.mockResolvedValue(false);
  mockCount.mockResolvedValue(0);
  mockCreate.mockResolvedValue({ ok: true, id: "rep1" });
});

describe("the target has to exist", () => {
  it("refuses a job id that resolves to nothing", async () => {
    // A queue full of ids naming nothing is a queue nobody reads.
    mockJob.mockResolvedValue(null);

    expect(await createReportForUser(USER, input({ targetId: "nosuchjob" }))).toEqual({
      ok: false,
      reason: "target-not-found",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses a company id that resolves to nothing", async () => {
    mockCompany.mockResolvedValue(null);

    expect(
      await createReportForUser(USER, input({ targetType: "company", targetId: "nosuchco" })),
    ).toEqual({ ok: false, reason: "target-not-found" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("looks the target up in the table its type names", async () => {
    await createReportForUser(USER, input({ targetType: "company", targetId: COMPANY_ID }));
    expect(mockCompany).toHaveBeenCalledWith(COMPANY_ID);
    expect(mockJob).not.toHaveBeenCalled();
  });

  it("files a report against a job that does exist", async () => {
    expect(await createReportForUser(USER, input())).toEqual({ ok: true, reportId: "rep1" });
    expect(mockCreate).toHaveBeenCalledWith(
      {
        reportedById: USER,
        targetType: "job",
        targetId: JOB_ID,
        // Stored in the moderator's vocabulary, not the reporter's.
        reason: "UPFRONT_PAYMENT",
        details: null,
      },
      MAX_OPEN_REPORTS_PER_USER,
    );
  });
});

describe("the rate limit, which is two count queries and no infrastructure", () => {
  it("refuses a second open report on the same target by the same person", async () => {
    mockDuplicate.mockResolvedValue(true);

    expect(await createReportForUser(USER, input())).toEqual({ ok: false, reason: "duplicate" });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockDuplicate).toHaveBeenCalledWith(USER, "job", JOB_ID);
  });

  it("allows the same target from a different person", async () => {
    // hasOpenReportForTarget is scoped to the reporter, so ten people reporting
    // one scam all get through — that is the signal, not the abuse.
    mockDuplicate.mockResolvedValue(false);
    expect((await createReportForUser("someone-else", input())).ok).toBe(true);
  });

  it("refuses the sixth open report", async () => {
    mockCount.mockResolvedValue(MAX_OPEN_REPORTS_PER_USER);

    expect(await createReportForUser(USER, input())).toEqual({
      ok: false,
      reason: "too-many-open",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("allows the fifth", async () => {
    mockCount.mockResolvedValue(MAX_OPEN_REPORTS_PER_USER - 1);
    expect((await createReportForUser(USER, input())).ok).toBe(true);
  });

  it("forwards a refusal the transaction made under its lock", async () => {
    // Two submits raced past the checks above; the write is the tiebreaker.
    mockCreate.mockResolvedValue({ ok: false, reason: "duplicate" });
    expect(await createReportForUser(USER, input())).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("what a report may say", () => {
  it("refuses a reason outside the enum", async () => {
    const result = await createReportForUser(
      USER,
      { ...input(), reason: "i-just-dont-like-them" } as unknown as ReportInput,
    );
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(mockJob).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses a target type outside the enum", async () => {
    const result = await createReportForUser(
      USER,
      { ...input(), targetType: "user" } as unknown as ReportInput,
    );
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses details longer than 2,000 characters", async () => {
    const result = await createReportForUser(USER, input({ details: "x".repeat(2001) }));
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts details at exactly 2,000", async () => {
    expect((await createReportForUser(USER, input({ details: "x".repeat(2000) }))).ok).toBe(true);
  });

  it("stores an empty explanation as null rather than an empty string", async () => {
    await createReportForUser(USER, input({ details: "   " }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ details: null }),
      MAX_OPEN_REPORTS_PER_USER,
    );
  });

  it("maps every reason to what the moderation queue reads", async () => {
    const expected: Record<string, string> = {
      "asked-for-payment": "UPFRONT_PAYMENT",
      "fake-job": "SUSPECTED_SCAM",
      impersonation: "IMPERSONATION",
      "off-platform-scam": "OFF_PLATFORM_PAYMENT",
      other: "OTHER",
    };
    for (const [key, stored] of Object.entries(expected)) {
      mockCreate.mockClear();
      await createReportForUser(USER, input({ reason: key as ReportInput["reason"] }));
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ reason: stored }),
        MAX_OPEN_REPORTS_PER_USER,
      );
    }
  });
});

describe("the action, which is where being signed in is enforced", () => {
  it("sends a logged-out caller to sign in and writes nothing", async () => {
    // requireUser redirects when there is no session — the real one throws the
    // same way. Nothing after it runs, so no row is ever considered.
    mockRequireUser.mockImplementation(() => {
      throw new Error("REDIRECT:/signin");
    });

    const to = await redirectedTo(() =>
      submitReport(form({ targetType: "job", targetId: JOB_ID, slug: "a-job", reason: "fake-job" })),
    );
    expect(to).toBe("/signin");
    expect(mockJob).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("files a signed-in report and returns to the page it came from", async () => {
    mockRequireUser.mockResolvedValue({ user: { id: USER } } as unknown as Awaited<
      ReturnType<typeof requireUser>
    >);

    const to = await redirectedTo(() =>
      submitReport(
        form({
          targetType: "job",
          targetId: JOB_ID,
          slug: "senior-shopify-developer",
          reason: "asked-for-payment",
          details: "",
        }),
      ),
    );
    expect(to).toBe("/jobs/senior-shopify-developer?notice=reported");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("takes the return path from the target type, never from the form", async () => {
    // No returnTo field exists, so there is no open redirect to aim at — a
    // hostile slug simply fails isPlausibleSlug and lands on browse.
    mockRequireUser.mockResolvedValue({ user: { id: USER } } as unknown as Awaited<
      ReturnType<typeof requireUser>
    >);

    const to = await redirectedTo(() =>
      submitReport(
        form({
          targetType: "job",
          targetId: JOB_ID,
          slug: "//evil.example.com/phish",
          reason: "fake-job",
        }),
      ),
    );
    expect(to).toBe("/jobs?notice=reported");
  });

  it("routes a company report back to the company page", async () => {
    mockRequireUser.mockResolvedValue({ user: { id: USER } } as unknown as Awaited<
      ReturnType<typeof requireUser>
    >);

    const to = await redirectedTo(() =>
      submitReport(
        form({
          targetType: "company",
          targetId: COMPANY_ID,
          slug: "acme-ltd",
          reason: "impersonation",
        }),
      ),
    );
    expect(to).toBe("/companies/acme-ltd?notice=reported");
  });

  it("turns a refusal into its own notice code rather than a generic failure", async () => {
    mockRequireUser.mockResolvedValue({ user: { id: USER } } as unknown as Awaited<
      ReturnType<typeof requireUser>
    >);
    mockDuplicate.mockResolvedValue(true);

    const to = await redirectedTo(() =>
      submitReport(form({ targetType: "job", targetId: JOB_ID, slug: "a-job", reason: "fake-job" })),
    );
    expect(to).toBe("/jobs/a-job?notice=report_duplicate");
  });

  it("rejects a missing reason before it reaches the service", async () => {
    mockRequireUser.mockResolvedValue({ user: { id: USER } } as unknown as Awaited<
      ReturnType<typeof requireUser>
    >);

    const to = await redirectedTo(() =>
      submitReport(form({ targetType: "job", targetId: JOB_ID, slug: "a-job" })),
    );
    expect(to).toBe("/jobs/a-job?notice=report_invalid");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
