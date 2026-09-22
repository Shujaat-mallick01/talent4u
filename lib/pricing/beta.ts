import type { PlanTier, UserRole } from "@/lib/generated/prisma/enums";

/**
 * Free beta: every plan costs nothing and every account behaves as if it were
 * on the top plan for its role.
 *
 * ── WHY IT IS A FLAG AND NOT A DELETION ─────────────────────────────────
 *
 * "Free for now" is a pricing decision, not an architecture decision. The
 * entitlement system, the Stripe integration, the regional price bands and the
 * whole plan × tier × role matrix pinned by gate-audit.test.ts all stay exactly
 * as they are. Flip this one constant back to false and the product charges
 * money again, with no code to rewrite and no tests to resurrect.
 *
 * Deleting the gates instead would have meant rebuilding them later from
 * memory — and the gates are the part of this codebase most expensive to get
 * right, because every one of them is the difference between a paid feature
 * and a free one.
 *
 * ── WHERE IT APPLIES, AND WHERE IT DELIBERATELY DOES NOT ────────────────
 *
 * It is applied at PLAN RESOLUTION — lib/db/users.ts, where an account's plan
 * is read from its subscription row — and nowhere else. getEntitlements stays
 * pure and its exhaustive audit suite stays green, because from its point of
 * view nothing has changed: it is simply handed a different plan.
 *
 * It does NOT touch the VERIFICATION TIER. An UNVERIFIED company still gets one
 * post and still cannot start a conversation, on any plan, during beta or
 * after it. Those gates are not about money — they are the trust model, and
 * handing an unverified stranger unlimited posting and cold outreach because
 * billing is switched off would be the single most damaging thing this flag
 * could do. CLAUDE.md's tier table is untouched by design.
 *
 * It does NOT upgrade somebody who actually paid. A real FREELANCER_PRO row is
 * returned unchanged, so if money was ever taken the entitlement still comes
 * from the subscription and not from this flag.
 *
 * ── ONE VISIBLE SIDE EFFECT, AND IT IS A GOOD ONE ───────────────────────
 *
 * Early access reads from the plan, so during beta a signed-in freelancer sees
 * new jobs immediately while a logged-out visitor still waits EARLY_ACCESS_HOURS.
 * That is not a bug to route around: it is the strongest reason to create an
 * account that the product has, and it costs nothing while there is no paying
 * Pro cohort to protect.
 */
export const BETA_FREE_ACCESS = true;

/**
 * The plan an account behaves as, given the plan its subscription row says.
 *
 * Pure, so the whole rule is unit-testable and so the one place that decides
 * this cannot drift from the one place that reads it.
 */
export function effectivePlanForBeta(
  role: UserRole | null | undefined,
  actual: PlanTier,
): PlanTier {
  if (!BETA_FREE_ACCESS) return actual;
  // Somebody who paid keeps what they bought — the entitlement comes from the
  // subscription, never from this flag.
  if (actual !== "FREE") return actual;

  switch (role) {
    case "FREELANCER":
      return "FREELANCER_PRO";
    case "RECRUITER":
      return "RECRUITER_TEAM";
    default:
      // ADMIN and logged-out. An admin's capabilities come from their role, and
      // granting a plan to a null role would hand entitlements to nobody in
      // particular.
      return actual;
  }
}

/** Copy for the surfaces that quote a price. One sentence, one home. */
export const BETA_NOTE = "Free while Talent4u is in beta — every feature, both sides.";
