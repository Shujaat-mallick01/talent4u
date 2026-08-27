import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/digest", () => ({
  DIGEST_INTERVAL_DAYS: 7,
  DIGEST_JOB_LIMIT: 6,
  listFreelancersDueDigest: vi.fn(),
  markDigestSent: vi.fn(),
  matchingJobsForDigest: vi.fn(),
}));
vi.mock("@/lib/email/notifications", () => ({ notifyJobDigest: vi.fn() }));

import {
  listFreelancersDueDigest,
  markDigestSent,
  matchingJobsForDigest,
} from "@/lib/db/digest";
import { notifyJobDigest } from "@/lib/email/notifications";
import { EARLY_ACCESS_HOURS } from "@/lib/pricing/plans";

import { runJobDigest } from "./digest";

/**
 * The four rules the digest exists to keep. Each one is the difference between
 * a useful email and the kind people filter, and none of them is visible from
 * the outside — so each is asserted here rather than trusted.
 */

const mockDue = vi.mocked(listFreelancersDueDigest);
const mockJobs = vi.mocked(matchingJobsForDigest);
const mockMark = vi.mocked(markDigestSent);
const mockSend = vi.mocked(notifyJobDigest);

const NOW = new Date("2026-08-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const person = (over: Record<string, unknown> = {}) => ({
  userId: "u1",
  email: "dev@example.com",
  displayName: "Jane",
  unsubscribeToken: null,
  lastJobDigestAt: null,
  skillIds: ["s1", "s2"],
  ...over,
});

const job = (over: Record<string, unknown> = {}) => ({
  slug: "senior-react",
  title: "Senior React Engineer",
  companyName: "Acme",
  budgetMinUsd: 4000,
  budgetMaxUsd: 8000,
  isRemote: true,
  matchedSkills: 2,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockMark.mockResolvedValue("tok_abc");
  mockSend.mockResolvedValue({ ok: true, id: "m1", event: "job-digest" } as never);
});

describe("never sent empty", () => {
  it("marks an account with no matches, and mails it nothing", async () => {
    mockDue.mockResolvedValue([person()]);
    mockJobs.mockResolvedValue([]);

    const summary = await runJobDigest(NOW);

    expect(mockSend).not.toHaveBeenCalled();
    // Still marked: otherwise every no-match account is re-examined on every
    // run and permanently occupies the front of the queue.
    expect(mockMark).toHaveBeenCalledWith("u1", NOW);
    expect(summary).toEqual({ considered: 1, sent: 0, noMatches: 1, failed: 0 });
  });

  it("mails an account that does have matches", async () => {
    mockDue.mockResolvedValue([person()]);
    mockJobs.mockResolvedValue([job()]);

    const summary = await runJobDigest(NOW);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(summary).toEqual({ considered: 1, sent: 1, noMatches: 0, failed: 0 });
  });
});

describe("marked before sent", () => {
  it("records the send before attempting it", async () => {
    const order: string[] = [];
    mockDue.mockResolvedValue([person()]);
    mockJobs.mockResolvedValue([job()]);
    mockMark.mockImplementation(async () => {
      order.push("mark");
      return "tok_abc";
    });
    mockSend.mockImplementation(async () => {
      order.push("send");
      return { ok: true, id: "m1", event: "job-digest" } as never;
    });

    await runJobDigest(NOW);

    // At-most-once. A crash between the two loses one weekly email; the other
    // order would mail somebody twice, which costs more than it saves.
    expect(order).toEqual(["mark", "send"]);
  });

  it("counts a refused send without unmarking it", async () => {
    mockDue.mockResolvedValue([person()]);
    mockJobs.mockResolvedValue([job()]);
    mockSend.mockResolvedValue({ ok: false, error: "provider down", event: "job-digest" } as never);

    const summary = await runJobDigest(NOW);

    expect(summary).toEqual({ considered: 1, sent: 0, noMatches: 0, failed: 1 });
    expect(mockMark).toHaveBeenCalledOnce();
  });
});

describe("nothing inside the early-access window", () => {
  it("stops short of it for every recipient", async () => {
    mockDue.mockResolvedValue([person()]);
    mockJobs.mockResolvedValue([job()]);

    await runJobDigest(NOW);

    const args = mockJobs.mock.calls[0][0];
    // Pro members see new posts first. The digest simply never reaches into
    // that window, so no plan lookup is needed and nothing can leak early.
    expect(args.publishedBefore).toEqual(
      new Date(NOW.getTime() - EARLY_ACCESS_HOURS * 60 * 60 * 1000),
    );
  });
});

describe("the window is per person", () => {
  it("starts from THIS person's last digest, so a missed week is caught up", async () => {
    const lastSent = new Date("2026-08-06T09:00:00Z"); // three weeks ago
    mockDue.mockResolvedValue([person({ lastJobDigestAt: lastSent })]);
    mockJobs.mockResolvedValue([job()]);

    await runJobDigest(NOW);

    expect(mockJobs.mock.calls[0][0].publishedAfter).toEqual(lastSent);
  });

  it("falls back to one interval for somebody who has never had one", async () => {
    mockDue.mockResolvedValue([person({ lastJobDigestAt: null })]);
    mockJobs.mockResolvedValue([job()]);

    await runJobDigest(NOW);

    expect(mockJobs.mock.calls[0][0].publishedAfter).toEqual(new Date(NOW.getTime() - 7 * DAY));
  });
});

describe("the mail itself", () => {
  it("carries a one-click unsubscribe built from the token", async () => {
    mockDue.mockResolvedValue([person()]);
    mockJobs.mockResolvedValue([job()]);
    mockMark.mockResolvedValue("tok_xyz");

    await runJobDigest(NOW);

    const args = mockSend.mock.calls[0][0];
    expect(args.unsubscribeUrl).toContain("/unsubscribe?token=tok_xyz");
    expect(args.to).toBe("dev@example.com");
  });

  it("formats a budget range, and omits one that was never stated", async () => {
    mockDue.mockResolvedValue([person()]);
    mockJobs.mockResolvedValue([
      job(),
      job({ slug: "b", budgetMinUsd: null, budgetMaxUsd: null }),
      job({ slug: "c", budgetMinUsd: 5000, budgetMaxUsd: null }),
    ]);

    await runJobDigest(NOW);

    const jobs = mockSend.mock.calls[0][0].jobs;
    expect(jobs[0].budget).toBe("$4,000–$8,000");
    expect(jobs[1].budget).toBeNull();
    expect(jobs[2].budget).toBe("From $5,000");
  });

  it("handles several recipients independently", async () => {
    mockDue.mockResolvedValue([person(), person({ userId: "u2", email: "b@example.com" })]);
    mockJobs.mockResolvedValueOnce([job()]).mockResolvedValueOnce([]);

    const summary = await runJobDigest(NOW);

    expect(summary).toEqual({ considered: 2, sent: 1, noMatches: 1, failed: 0 });
    expect(mockMark).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("does nothing at all when nobody is due", async () => {
    mockDue.mockResolvedValue([]);
    const summary = await runJobDigest(NOW);
    expect(summary).toEqual({ considered: 0, sent: 0, noMatches: 0, failed: 0 });
    expect(mockMark).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
