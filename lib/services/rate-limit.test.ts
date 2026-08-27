import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/rate-limit", () => ({
  hitRateLimit: vi.fn(),
  clearRateLimit: vi.fn(),
  rateLimitKey: (action: string, subject: string) => `${action}:${subject}`,
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { headers } from "next/headers";

import { clearRateLimit, hitRateLimit } from "@/lib/db/rate-limit";

import { callerIp, checkRateLimit, forgetRateLimit, RATE_LIMITS } from "./rate-limit";

const mockHit = vi.mocked(hitRateLimit);
const mockClear = vi.mocked(clearRateLimit);
const mockHeaders = vi.mocked(headers);

const headerMap = (values: Record<string, string>) =>
  mockHeaders.mockResolvedValue({
    get: (k: string) => values[k.toLowerCase()] ?? null,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the verdict", () => {
  it("allows everything up to and including the limit", async () => {
    const { max, windowSeconds } = RATE_LIMITS["sign-in"];
    mockHit.mockResolvedValue({ count: max, windowStart: new Date() });

    expect(await checkRateLimit("sign-in", "someone")).toEqual({ allowed: true });
    expect(mockHit).toHaveBeenCalledWith("sign-in:someone", windowSeconds);
  });

  it("refuses the one after it", async () => {
    const { max } = RATE_LIMITS["sign-in"];
    mockHit.mockResolvedValue({ count: max + 1, windowStart: new Date() });

    const verdict = await checkRateLimit("sign-in", "someone");
    expect(verdict.allowed).toBe(false);
  });

  it("says how long is left, counted from when the window opened", async () => {
    const { max, windowSeconds } = RATE_LIMITS["sign-in"];
    // Window opened 60 seconds ago.
    mockHit.mockResolvedValue({
      count: max + 1,
      windowStart: new Date(Date.now() - 60_000),
    });

    const verdict = await checkRateLimit("sign-in", "someone");
    if (verdict.allowed) throw new Error("expected a refusal");
    expect(verdict.retryAfterSeconds).toBeGreaterThan(windowSeconds - 65);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(windowSeconds - 55);
  });

  it("never reports a retry time of zero or less", async () => {
    const { max, windowSeconds } = RATE_LIMITS["sign-in"];
    // A window that has, by the clock, already elapsed.
    mockHit.mockResolvedValue({
      count: max + 1,
      windowStart: new Date(Date.now() - windowSeconds * 2000),
    });

    const verdict = await checkRateLimit("sign-in", "someone");
    if (verdict.allowed) throw new Error("expected a refusal");
    // "Try again in 0 seconds" reads as broken, and a negative one reads worse.
    expect(verdict.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("what happens when the limiter itself breaks", () => {
  it("FAILS OPEN, and says so in the log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockHit.mockRejectedValue(new Error("pool exhausted"));

    // Deliberate: this is a backstop against abuse, not an authorization rule.
    // Taking signups and applications down with it would be a far bigger
    // outage than the one it defends against.
    expect(await checkRateLimit("sign-up", "1.2.3.4")).toEqual({ allowed: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not fail a successful sign-in when clearing the count throws", async () => {
    mockClear.mockRejectedValue(new Error("gone"));
    await expect(forgetRateLimit("sign-in", "someone")).resolves.toBeUndefined();
  });
});

describe("the policies themselves", () => {
  it("gives every action a positive ceiling and a positive window", () => {
    for (const [action, policy] of Object.entries(RATE_LIMITS)) {
      expect(policy.max, action).toBeGreaterThan(0);
      expect(policy.windowSeconds, action).toBeGreaterThan(0);
    }
  });

  it("keeps cold outreach much tighter than ordinary messaging", () => {
    // Messaging someone who applied to you is a conversation. Messaging a
    // stranger is the one thing that can become spam, so it gets a daily
    // budget rather than an hourly one.
    expect(RATE_LIMITS.outreach.windowSeconds).toBeGreaterThan(RATE_LIMITS.message.windowSeconds);
  });

  it("keeps the unauthenticated limits the tightest of all", () => {
    // Nothing behind these has an account yet, so there is no other rule to
    // fall back on.
    expect(RATE_LIMITS["sign-up"].max).toBeLessThan(RATE_LIMITS.message.max);
    expect(RATE_LIMITS["password-reset"].max).toBeLessThan(RATE_LIMITS.message.max);
  });
});

describe("identifying an anonymous caller", () => {
  it("takes the left-most entry of x-forwarded-for", async () => {
    // Left-most is the original client; everything after it is a proxy.
    headerMap({ "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" });
    expect(await callerIp()).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", async () => {
    headerMap({ "x-real-ip": "198.51.100.4" });
    expect(await callerIp()).toBe("198.51.100.4");
  });

  it("degrades to one shared bucket rather than to no limit", async () => {
    headerMap({});
    // Everyone unidentifiable shares a bucket. That inconveniences people
    // behind one NAT; the alternative leaves signup open to a script.
    expect(await callerIp()).toBe("unknown");
  });
});
