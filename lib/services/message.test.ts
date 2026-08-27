import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/message", () => ({
  findConversationIdForApplication: vi.fn(),
  findOutreachConversationId: vi.fn(),
  getConversationForUser: vi.fn(),
  getOutreachParties: vi.fn(),
  listConversationsForUser: vi.fn(),
  markConversationRead: vi.fn(),
  sendMessageTx: vi.fn(),
  startConversationTx: vi.fn(),
  startOutreachTx: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getEntitlementContext: vi.fn() }));
vi.mock("@/lib/db/engagement", () => ({ getApplicationParties: vi.fn() }));
vi.mock("./message-safety", () => ({ scanMessageOnWrite: vi.fn() }));

import {
  findConversationIdForApplication,
  findOutreachConversationId,
  getConversationForUser,
  getOutreachParties,
  markConversationRead,
  sendMessageTx,
  startConversationTx,
  startOutreachTx,
} from "@/lib/db/message";
import { getApplicationParties } from "@/lib/db/engagement";
import { getEntitlementContext } from "@/lib/db/users";

import {
  getThreadForUser,
  sendMessageForUser,
  startConversationForUser,
  startOutreachForUser,
} from "./message";
import { scanMessageOnWrite } from "./message-safety";

const mockContext = vi.mocked(getEntitlementContext);
const mockParties = vi.mocked(getApplicationParties);
const mockStart = vi.mocked(startConversationTx);
const mockSend = vi.mocked(sendMessageTx);
const mockGetThread = vi.mocked(getConversationForUser);
const mockMarkRead = vi.mocked(markConversationRead);
const mockFind = vi.mocked(findConversationIdForApplication);
const mockScan = vi.mocked(scanMessageOnWrite);
const mockOutreachParties = vi.mocked(getOutreachParties);
const mockOutreachStart = vi.mocked(startOutreachTx);
const mockFindOutreach = vi.mocked(findOutreachConversationId);

const FL_USER = "00000000-0000-4000-8000-0000000000f1";
const REC_USER = "00000000-0000-4000-8000-0000000000r1";
const STRANGER = "00000000-0000-4000-8000-0000000000s1";
const APP_ID = "app_1";
const CONV_ID = "conv_1";
const BODY = "Are you free to start on the 3rd?";

type Ctx = {
  role: "FREELANCER" | "RECRUITER" | "ADMIN";
  recruiterTier?: "UNVERIFIED" | "VERIFIED" | "TRUSTED" | null;
  isBanned?: boolean;
  /** Outreach is plan-gated; nothing else in this file is. */
  plan?: "FREE" | "RECRUITER_GROWTH" | "RECRUITER_TEAM";
};

const asUser = ({ role, recruiterTier = null, isBanned = false, plan = "FREE" }: Ctx) => {
  mockContext.mockResolvedValue({
    role,
    plan,
    billingCountry: null,
    recruiterTier,
    isBanned,
  } as unknown as Awaited<ReturnType<typeof getEntitlementContext>>);
};

const application = (over: Record<string, unknown> = {}) =>
  ({
    id: APP_ID,
    freelancerId: "fl_1",
    freelancer: { userId: FL_USER, displayName: "Dev" },
    job: {
      id: "job_1",
      title: "Job",
      recruiterId: "rec_1",
      recruiter: { userId: REC_USER, companyName: "Co", isBanned: false },
    },
    ...over,
  }) as unknown as NonNullable<Awaited<ReturnType<typeof getApplicationParties>>>;

beforeEach(() => {
  vi.resetAllMocks();
  mockScan.mockResolvedValue({ flagged: false });
});

/**
 * CLAUDE.md's messaging rules. The one that carries the most weight is the
 * tier asymmetry: an UNVERIFIED company may reply but may never write first.
 */
describe("who may open a conversation", () => {
  const input = { applicationId: APP_ID, body: BODY };

  it("lets a freelancer write first to a company they applied to", async () => {
    asUser({ role: "FREELANCER" });
    mockParties.mockResolvedValue(application());
    mockStart.mockResolvedValue({ ok: true, conversationId: CONV_ID, messageId: "m1", created: true });

    expect(await startConversationForUser(FL_USER, input)).toEqual({
      ok: true,
      conversationId: CONV_ID,
      flagged: false,
    });
    // Both participants are derived from the application, never sent by the
    // caller — the input carries no recipient at all.
    expect(mockStart).toHaveBeenCalledWith({
      applicationId: APP_ID,
      jobId: "job_1",
      senderUserId: FL_USER,
      recipientUserId: REC_USER,
      body: BODY,
    });
  });

  it("refuses an UNVERIFIED company writing first", async () => {
    // CLAUDE.md tier table: "UNVERIFIED … Cannot initiate messages."
    asUser({ role: "RECRUITER", recruiterTier: "UNVERIFIED" });
    mockParties.mockResolvedValue(application());

    expect(await startConversationForUser(REC_USER, input)).toEqual({
      ok: false,
      reason: "cannot-initiate",
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("lets a VERIFIED company write first", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "VERIFIED" });
    mockParties.mockResolvedValue(application());
    mockStart.mockResolvedValue({ ok: true, conversationId: CONV_ID, messageId: "m1", created: true });

    expect((await startConversationForUser(REC_USER, input)).ok).toBe(true);
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ senderUserId: REC_USER, recipientUserId: FL_USER }),
    );
  });

  it("refuses a stranger who is party to neither side", async () => {
    asUser({ role: "FREELANCER" });
    mockParties.mockResolvedValue(application());

    expect(await startConversationForUser(STRANGER, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("refuses a thread with a removed employer, from either direction", async () => {
    const banned = application({
      job: {
        id: "job_1",
        title: "Job",
        recruiterId: "rec_1",
        recruiter: { userId: REC_USER, companyName: "Co", isBanned: true },
      },
    });

    asUser({ role: "FREELANCER" });
    mockParties.mockResolvedValue(banned);
    expect(await startConversationForUser(FL_USER, input)).toEqual({
      ok: false,
      reason: "recruiter-banned",
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("gives an admin no standing — they are party to nobody's conversation", async () => {
    asUser({ role: "ADMIN" });
    expect(await startConversationForUser("admin", input)).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(mockParties).not.toHaveBeenCalled();
  });

  it("routes a duplicate into the thread that already exists", async () => {
    asUser({ role: "FREELANCER" });
    mockParties.mockResolvedValue(application());
    mockStart.mockResolvedValue({ ok: false, reason: "already-exists" });
    mockFind.mockResolvedValue(CONV_ID);

    expect(await startConversationForUser(FL_USER, input)).toEqual({
      ok: false,
      reason: "already-exists",
      conversationId: CONV_ID,
    });
  });
});

describe("replying", () => {
  const input = { conversationId: CONV_ID, body: BODY };

  it("lets an UNVERIFIED company reply, which is the point of the asymmetry", async () => {
    // They cannot open a thread, but a freelancer who wrote to them must be
    // able to get an answer — otherwise the question hangs forever.
    asUser({ role: "RECRUITER", recruiterTier: "UNVERIFIED" });
    mockSend.mockResolvedValue({ ok: true, messageId: "m2" });

    expect(await sendMessageForUser(REC_USER, input)).toEqual({ ok: true, flagged: false });
    expect(mockSend).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      senderUserId: REC_USER,
      body: BODY,
    });
  });

  it("refuses a removed employer, even in a thread they were already in", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "VERIFIED", isBanned: true });
    expect(await sendMessageForUser(REC_USER, input)).toEqual({ ok: false, reason: "banned" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses a non-participant, as decided by the write itself", async () => {
    asUser({ role: "FREELANCER" });
    mockSend.mockResolvedValue({ ok: false, reason: "not-a-participant" });

    expect(await sendMessageForUser(STRANGER, input)).toEqual({
      ok: false,
      reason: "not-a-participant",
    });
  });
});

describe("the safety scanner", () => {
  it("runs on every message, and reports a flag without withholding delivery", async () => {
    asUser({ role: "FREELANCER" });
    mockSend.mockResolvedValue({ ok: true, messageId: "m3" });
    mockScan.mockResolvedValue({
      flagged: true,
      match: { reason: "UPFRONT_PAYMENT", matchedTerm: "registration fee" },
      recorded: true,
    } as unknown as Awaited<ReturnType<typeof scanMessageOnWrite>>);

    // ok: true — the message WAS delivered. Flagging opens a moderation entry;
    // it does not retract what was sent.
    expect(await sendMessageForUser(FL_USER, { conversationId: CONV_ID, body: "pay a registration fee" })).toEqual({
      ok: true,
      flagged: true,
    });
    expect(mockScan).toHaveBeenCalledWith("m3", "pay a registration fee");
  });

  it("does not scan when the write was refused", async () => {
    asUser({ role: "FREELANCER" });
    mockSend.mockResolvedValue({ ok: false, reason: "not-a-participant" });

    await sendMessageForUser(STRANGER, { conversationId: CONV_ID, body: BODY });
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("reading a thread", () => {
  it("reports not-found for a conversation the viewer is not in", async () => {
    asUser({ role: "FREELANCER" });
    // The db layer scopes by membership, so a non-member simply gets null —
    // indistinguishable from a thread that does not exist.
    mockGetThread.mockResolvedValue(null);

    expect(await getThreadForUser(STRANGER, CONV_ID)).toEqual({ ok: false, reason: "not-found" });
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it("marks the thread read on open", async () => {
    asUser({ role: "FREELANCER" });
    mockGetThread.mockResolvedValue({ id: CONV_ID, messages: [], participants: [] } as never);

    const result = await getThreadForUser(FL_USER, CONV_ID);
    expect(result.ok).toBe(true);
    expect(mockMarkRead).toHaveBeenCalledWith(CONV_ID, FL_USER);
  });
});

/**
 * Recruiter outreach: writing to somebody who never applied.
 *
 * Two independent gates, and the asymmetry between them is the design. The
 * PLAN decides whether cold messaging is available at all — CLAUDE.md puts
 * outbound messaging behind the paid wall alongside candidate search. The
 * VERIFICATION TIER decides whether this company may write first to anyone,
 * ever, and no amount of money lifts it. A verified company on the free plan
 * cannot reach strangers; an unverified company on Team cannot either.
 */
describe("startOutreachForUser", () => {
  const FL_ID = "fl_1";
  const JOB_ID = "job_1";
  const input = { freelancerId: FL_ID, jobId: JOB_ID, body: BODY };

  const parties = (over: Record<string, unknown> = {}) =>
    ({
      freelancerUserId: FL_USER,
      freelancerName: "Dev",
      recruiterUserId: REC_USER,
      recruiterIsBanned: false,
      jobTitle: "Senior React Engineer",
      jobIsOpen: true,
      ...over,
    }) as NonNullable<Awaited<ReturnType<typeof getOutreachParties>>>;

  it("refuses a free recruiter, however verified, without looking anything up", async () => {
    for (const recruiterTier of ["VERIFIED", "TRUSTED"] as const) {
      vi.resetAllMocks();
      mockScan.mockResolvedValue({ flagged: false });
      asUser({ role: "RECRUITER", recruiterTier, plan: "FREE" });

      const result = await startOutreachForUser(REC_USER, input);

      expect(result).toEqual({ ok: false, reason: "plan-required" });
      expect(mockOutreachParties).not.toHaveBeenCalled();
      expect(mockOutreachStart).not.toHaveBeenCalled();
    }
  });

  it("refuses an UNVERIFIED company even on the top plan", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "UNVERIFIED", plan: "RECRUITER_TEAM" });

    const result = await startOutreachForUser(REC_USER, input);

    // Paying does not buy the right to write to strangers.
    expect(result).toEqual({ ok: false, reason: "cannot-initiate" });
    expect(mockOutreachStart).not.toHaveBeenCalled();
  });

  it("refuses a company with no verification tier at all", async () => {
    asUser({ role: "RECRUITER", recruiterTier: null, plan: "RECRUITER_GROWTH" });
    expect(await startOutreachForUser(REC_USER, input)).toEqual({
      ok: false,
      reason: "cannot-initiate",
    });
  });

  it("refuses a freelancer outright, whatever plan they hold", async () => {
    asUser({ role: "FREELANCER", plan: "RECRUITER_TEAM" });
    expect(await startOutreachForUser(FL_USER, input)).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(mockOutreachStart).not.toHaveBeenCalled();
  });

  it("refuses a removed employer", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "TRUSTED", plan: "RECRUITER_TEAM", isBanned: true });
    expect(await startOutreachForUser(REC_USER, input)).toEqual({ ok: false, reason: "banned" });
    expect(mockOutreachStart).not.toHaveBeenCalled();
  });

  it("refuses a job that is not theirs, because the lookup returns nothing", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "VERIFIED", plan: "RECRUITER_GROWTH" });
    mockOutreachParties.mockResolvedValue(null);
    expect(await startOutreachForUser(REC_USER, input)).toEqual({ ok: false, reason: "not-found" });
    expect(mockOutreachStart).not.toHaveBeenCalled();
  });

  it("refuses a role that is not open", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "VERIFIED", plan: "RECRUITER_GROWTH" });
    mockOutreachParties.mockResolvedValue(parties({ jobIsOpen: false }));
    // Inviting somebody to a draft wastes their time, and bulk-inviting to
    // closed roles is the shape spam takes.
    expect(await startOutreachForUser(REC_USER, input)).toEqual({ ok: false, reason: "job-closed" });
    expect(mockOutreachStart).not.toHaveBeenCalled();
  });

  it("sends for a verified company on a paid plan, and scans afterwards", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "VERIFIED", plan: "RECRUITER_GROWTH" });
    mockOutreachParties.mockResolvedValue(parties());
    mockOutreachStart.mockResolvedValue({
      ok: true,
      conversationId: CONV_ID,
      messageId: "msg_1",
      created: true,
    });

    const result = await startOutreachForUser(REC_USER, input);

    expect(result).toEqual({ ok: true, conversationId: CONV_ID, flagged: false });
    expect(mockOutreachStart).toHaveBeenCalledWith({
      jobId: JOB_ID,
      senderUserId: REC_USER,
      // Derived from the lookup, never taken from the caller.
      recipientUserId: FL_USER,
      body: BODY,
    });
    // Delivered first, flagged second, never silently withheld.
    expect(mockScan).toHaveBeenCalledWith("msg_1", BODY);
  });

  it("reports a flagged message as sent, because it was", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "TRUSTED", plan: "RECRUITER_TEAM" });
    mockOutreachParties.mockResolvedValue(parties());
    mockOutreachStart.mockResolvedValue({
      ok: true,
      conversationId: CONV_ID,
      messageId: "msg_2",
      created: true,
    });
    mockScan.mockResolvedValue({
      flagged: true,
      match: { reason: "UPFRONT_PAYMENT", matchedTerm: "registration fee" },
      recorded: true,
    } as unknown as Awaited<ReturnType<typeof scanMessageOnWrite>>);

    expect(await startOutreachForUser(REC_USER, input)).toEqual({
      ok: true,
      conversationId: CONV_ID,
      flagged: true,
    });
  });

  it("routes a duplicate into the thread that already exists", async () => {
    asUser({ role: "RECRUITER", recruiterTier: "VERIFIED", plan: "RECRUITER_GROWTH" });
    mockOutreachParties.mockResolvedValue(parties());
    // The outreachKey unique index refused it: a double-submit, or they have
    // written to this person about this role before.
    mockOutreachStart.mockResolvedValue({ ok: false, reason: "already-exists" });
    mockFindOutreach.mockResolvedValue(CONV_ID);

    expect(await startOutreachForUser(REC_USER, input)).toEqual({
      ok: false,
      reason: "already-exists",
      conversationId: CONV_ID,
    });
  });
});
