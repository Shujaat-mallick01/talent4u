import { describe, expect, it } from "vitest";
import { BETA_FREE_ACCESS, BETA_NOTE, effectivePlanForBeta } from "./beta";

describe("beta pricing access", () => {
  it("exports beta note and free access flag", () => {
    expect(BETA_FREE_ACCESS).toBe(true);
    expect(BETA_NOTE).toContain("Free while Talent4u is in beta");
  });

  describe("effectivePlanForBeta", () => {
    it("elevates FREE freelancers to FREELANCER_PRO", () => {
      expect(effectivePlanForBeta("FREELANCER", "FREE")).toBe("FREELANCER_PRO");
    });

    it("elevates FREE recruiters to RECRUITER_TEAM", () => {
      expect(effectivePlanForBeta("RECRUITER", "FREE")).toBe("RECRUITER_TEAM");
    });

    it("leaves already-paid subscriptions untouched", () => {
      expect(effectivePlanForBeta("FREELANCER", "FREELANCER_PRO")).toBe("FREELANCER_PRO");
      expect(effectivePlanForBeta("RECRUITER", "RECRUITER_GROWTH")).toBe("RECRUITER_GROWTH");
      expect(effectivePlanForBeta("RECRUITER", "RECRUITER_TEAM")).toBe("RECRUITER_TEAM");
    });

    it("does not elevate ADMIN or unauthenticated accounts", () => {
      expect(effectivePlanForBeta("ADMIN", "FREE")).toBe("FREE");
      expect(effectivePlanForBeta(null, "FREE")).toBe("FREE");
      expect(effectivePlanForBeta(undefined, "FREE")).toBe("FREE");
    });
  });
});
