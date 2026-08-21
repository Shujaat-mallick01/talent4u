import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/safety", () => ({ flagMessage: vi.fn() }));

import { flagMessage } from "@/lib/db/safety";

import { scanMessageOnWrite } from "./message-safety";

const mockFlag = vi.mocked(flagMessage);

beforeEach(() => vi.resetAllMocks());

describe("scanMessageOnWrite", () => {
  it("leaves an ordinary message alone", async () => {
    const result = await scanMessageOnWrite(
      "msg_1",
      "Thanks for applying — are you free for a call on Thursday?",
    );
    expect(result).toEqual({ flagged: false });
    expect(mockFlag).not.toHaveBeenCalled();
  });

  it("flags an upfront-payment demand and records it", async () => {
    mockFlag.mockResolvedValue(true);
    const result = await scanMessageOnWrite(
      "msg_2",
      "Before we start there's a refundable deposit of $50 for the equipment.",
    );
    expect(result).toMatchObject({ flagged: true, recorded: true });
    if (result.flagged) expect(result.match.reason).toBe("UPFRONT_PAYMENT");
    expect(mockFlag).toHaveBeenCalledWith({
      messageId: "msg_2",
      reason: "UPFRONT_PAYMENT",
      matchedTerm: "refundable deposit",
    });
  });

  it("flags an off-platform payment request", async () => {
    mockFlag.mockResolvedValue(true);
    const result = await scanMessageOnWrite(
      "msg_3",
      "Easier if we settle outside the site — send us your PayPal address and we'll transfer the funds.",
    );
    expect(result.flagged).toBe(true);
    if (result.flagged) expect(result.match.reason).toBe("OFF_PLATFORM_PAYMENT");
  });

  it("does not flag messages that merely discuss a payment tool", async () => {
    const result = await scanMessageOnWrite(
      "msg_4",
      "The role involves maintaining our PayPal and Stripe integrations.",
    );
    expect(result).toEqual({ flagged: false });
  });

  it("reports recorded:false when the message was already flagged (no duplicate queue entry)", async () => {
    mockFlag.mockResolvedValue(false);
    const result = await scanMessageOnWrite("msg_5", "pay a registration fee to begin");
    expect(result).toMatchObject({ flagged: true, recorded: false });
  });
});
