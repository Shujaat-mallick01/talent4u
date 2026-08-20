import { Prisma } from "@/lib/generated/prisma/client";
import { createRecruiterProfile, findRecruiterSlugsLike } from "@/lib/db/recruiter";
import { getUserAuthState } from "@/lib/db/users";
import { uploadCompanyLogo } from "@/lib/storage/logos";
import type { RecruiterOnboardingInput } from "@/lib/validations/recruiter";

import { conflictField, pickAvailableSlug, slugify } from "./slug";

/**
 * Recruiter profile business logic. The caller passes Zod-validated fields and
 * an already-size/type-checked logo File (or null). This layer re-checks the
 * role and one-profile-per-user invariants (also enforced by the database),
 * uploads the logo, generates a unique slug, and creates the profile —
 * always UNVERIFIED, since collecting verification data is not verification.
 */

const SLUG_RETRY_LIMIT = 5;

export type OnboardRecruiterResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      reason: "wrong-role" | "already-onboarded" | "logo-failed" | "conflict";
      message?: string;
    };

export async function generateUniqueRecruiterSlug(companyName: string): Promise<string> {
  const base = slugify(companyName, "company");
  const taken = await findRecruiterSlugsLike(base);
  return pickAvailableSlug(base, taken);
}

export async function onboardRecruiter(
  userId: string,
  input: RecruiterOnboardingInput,
  logo: File | null,
): Promise<OnboardRecruiterResult> {
  const state = await getUserAuthState(userId);
  if (!state || state.role !== "RECRUITER") return { ok: false, reason: "wrong-role" };
  if (state.hasProfile) return { ok: false, reason: "already-onboarded" };

  // Upload the logo only after the guards pass. If a later slug-exhaustion or
  // already-onboarded conflict aborts the create, the uploaded object is
  // orphaned but harmless (namespaced under this user's id).
  let logoUrl: string | null = null;
  if (logo) {
    const uploaded = await uploadCompanyLogo(userId, logo);
    if (!uploaded.ok) return { ok: false, reason: "logo-failed", message: uploaded.message };
    logoUrl = uploaded.url;
  }

  for (let attempt = 0; attempt < SLUG_RETRY_LIMIT; attempt += 1) {
    const slug = await generateUniqueRecruiterSlug(input.companyName);
    try {
      const profile = await createRecruiterProfile({ userId, slug, input, logoUrl });
      return { ok: true, slug: profile.slug };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const field = conflictField(error);
        if (field === "userId") return { ok: false, reason: "already-onboarded" };
        if (field === "slug") continue;
        return { ok: false, reason: "conflict" };
      }
      throw error;
    }
  }
  return { ok: false, reason: "conflict" };
}
