import { redirect } from "next/navigation";

import type { UserRole } from "@/lib/generated/prisma/enums";
import {
  getFreelancerProfileByUserId,
  getRecruiterProfileByUserId,
  getUserAuthState,
  type UserAuthState,
} from "@/lib/db/users";

import { homeFor } from "./route-guard";
import { getSession, type Session } from "./session";

/**
 * Server-side auth guards. Every protected page, layout, action, and route
 * handler calls one of these directly — proxy.ts is a convenience layer on
 * top, never the enforcement. Assume the caller is curl.
 */

export type AuthenticatedUser = {
  session: Session;
  user: UserAuthState;
};

/**
 * The signed-in user with a completed account (role chosen), or a redirect:
 * to /signin when logged out, to /onboarding when the Supabase session has
 * no app account yet.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const session = await getSession();
  if (!session) redirect("/signin");

  const user = await getUserAuthState(session.userId);
  if (!user) redirect("/onboarding");

  return { session, user };
}

/**
 * requireUser, plus the role must match — anyone else is sent to their own
 * home. Role comes from the database row, never from anything the client
 * sent, so it cannot be forged or changed after signup.
 */
export async function requireRole(role: UserRole): Promise<AuthenticatedUser> {
  const authed = await requireUser();
  if (authed.user.role !== role) {
    redirect(homeFor(authed.user.role, authed.user.hasProfile));
  }
  return authed;
}

export type CurrentProfile =
  | { role: "FREELANCER"; profile: NonNullable<Awaited<ReturnType<typeof getFreelancerProfileByUserId>>> }
  | { role: "RECRUITER"; profile: NonNullable<Awaited<ReturnType<typeof getRecruiterProfileByUserId>>> };

/**
 * The role-specific profile of the current user, or null while onboarding is
 * incomplete (or the caller is not signed in / has no account / is an admin,
 * who has no profile concept).
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await getUserAuthState(session.userId);
  if (!user) return null;

  if (user.role === "FREELANCER") {
    const profile = await getFreelancerProfileByUserId(user.id);
    return profile ? { role: "FREELANCER", profile } : null;
  }
  if (user.role === "RECRUITER") {
    const profile = await getRecruiterProfileByUserId(user.id);
    return profile ? { role: "RECRUITER", profile } : null;
  }
  return null;
}
