import { cache } from "react";

import { entitledPlanFrom } from "@/lib/billing/subscription-state";
import type { PlanTier, UserRole } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";

import { prisma } from "./client";

/**
 * The plan a user's entitlements derive from (any role — recruiter post caps,
 * freelancer Pro early access).
 *
 * The rule itself lives in entitledPlanFrom so that this and
 * getEntitlementContext cannot drift apart: only a live subscription counts,
 * PAST_DUE and CANCELED read FREE, and a live-looking row whose period ended
 * well past the grace window reads FREE too — a paid plan must not outlive the
 * webhooks that were keeping it alive.
 */
export async function getUserPlan(userId: string): Promise<PlanTier> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, currentPeriodEnd: true },
  });
  return entitledPlanFrom(sub);
}

/**
 * Everything needed to answer "what may this account do, and what does it
 * pay" in one query: the live plan, the billing country the price band is
 * resolved from, the role, and the recruiter's verification tier (which caps
 * posts and messaging independently of the plan).
 *
 * Request-cached because the header, the page body, and any gate in between
 * all want the same answer in one render.
 */
export const getEntitlementContext = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      billingCountry: true,
      subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
      // isBanned travels with the tier: every caller that acts on a recruiter's
      // standing must also refuse to act for a removed employer, and a shape
      // that omits it makes that easy to forget.
      recruiter: { select: { tier: true, isBanned: true } },
    },
  });
  if (!user) return null;

  // The same one function getUserPlan uses: PAST_DUE and CANCELED fall back to
  // FREE rather than keeping paid capabilities alive, and so does a row whose
  // period ended long enough ago that we have plainly stopped hearing from
  // Stripe about it.
  const plan: PlanTier = entitledPlanFrom(user.subscription);

  return {
    role: user.role,
    plan,
    billingCountry: user.billingCountry,
    recruiterTier: user.recruiter?.tier ?? null,
    isBanned: user.recruiter?.isBanned ?? false,
  };
});

/**
 * Everything the auth layer needs to know about an account in one indexed
 * PK lookup: who they are, which role they chose, and whether onboarding
 * (profile creation) is complete.
 */
export type UserAuthState = {
  id: string;
  email: string;
  role: UserRole;
  hasProfile: boolean;
};

/**
 * Uncached variant for re-reads AFTER a mutation in the same request (e.g.
 * recovering from a create race in the auth callback) — the cached wrapper
 * below would return the memoized pre-mutation result there.
 */
export async function getUserAuthStateFresh(id: string): Promise<UserAuthState | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      freelancer: { select: { id: true } },
      recruiter: { select: { id: true } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    hasProfile:
      user.role === "FREELANCER"
        ? user.freelancer !== null
        : user.role === "RECRUITER"
          ? user.recruiter !== null
          : true, // ADMIN has no profile concept; never "incomplete"
  };
}

/**
 * Request-cached: the header, guards, and page bodies all consult this in one
 * render — one PK query per request instead of three.
 */
export const getUserAuthState = cache(getUserAuthStateFresh);

export type CreateUserResult =
  | { ok: true; state: UserAuthState }
  | { ok: false; reason: "already-exists" };

/**
 * Creates the app-side User row for a Supabase Auth user, fixing their role
 * forever. This is a create, never an upsert: role immutability means the
 * only way a role is ever written is on the row's first and only insert.
 * A conflict (id or email already present) reports "already-exists" — the
 * caller routes the user by their EXISTING role and discards the attempt.
 */
export async function createUserWithRole(
  id: string,
  email: string,
  role: Extract<UserRole, "FREELANCER" | "RECRUITER">,
): Promise<CreateUserResult> {
  try {
    const user = await prisma.user.create({
      data: { id, email, role },
      select: { id: true, email: true, role: true },
    });
    return {
      ok: true,
      state: { id: user.id, email: user.email, role: user.role, hasProfile: false },
    };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "already-exists" };
    }
    throw error;
  }
}

/** Mirrors Supabase's email confirmation into the app row, once. */
export async function markEmailVerified(id: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id, emailVerified: null },
    data: { emailVerified: new Date() },
  });
}

export async function getFreelancerProfileByUserId(userId: string) {
  return prisma.freelancerProfile.findUnique({ where: { userId } });
}

export async function getRecruiterProfileByUserId(userId: string) {
  return prisma.recruiterProfile.findUnique({ where: { userId } });
}
