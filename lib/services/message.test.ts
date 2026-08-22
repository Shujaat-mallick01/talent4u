import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/message", () => ({
  findConversationIdForApplication: vi.fn(),
  getConversationForUser: vi.fn(),
  listConversationsForUser: vi.fn(),
  markConversationRead: vi.fn(),
  sendMessageTx: vi.fn(),
  startConversationTx: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({ getEntitlementContext: vi.fn() }));
vi.mock("@/lib/db/engagement", () => ({ getApplicationParties: vi.fn() }));
vi.mock("./message-safety", () => ({ scanMessageOnWrite: vi.fn() }));

import {
  findConversationIdForApplication,
  getConversationForUser,
  markConversationRead,
  sendMessageTx,
  startConversationTx,
} from "@/lib/db/message";
import { getApplicationParties } from "@/lib/db/engagement";
import { getEntitlementContext } from "@/lib/db/users";

import { getThreadForUser, sendMessageForUser, startConversationForUser } from "./message";
import { scanMessageOnWrite } from "./message-safety";

const mockContext = vi.mocked(getEntitlementContext);
const mockParties = vi.mocked(getApplicationParties);
const mockStart = vi.mocked(startConversationTx);
const mockSend = vi.mocked(sendMessageTx);
const mockGetThread = vi.mocked(getConversationForUser);
const mockMarkRead = vi.mocked(markConversationRead);
const mockFind = vi.mocked(findConversationIdForApplication);
const mockScan = vi.mocked(scanMessageOnWrite);

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
};

const asUser = ({ role, recruiterTier = null, isBanned = false }: Ctx) => {
  mockContext.mockResolvedValue({
    role,
    plan: "FREE",
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
