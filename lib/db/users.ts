import type { UserRole } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";

import { prisma } from "./client";

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

export async function getUserAuthState(id: string): Promise<UserAuthState | null> {
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
