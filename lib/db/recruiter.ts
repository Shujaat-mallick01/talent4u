import { cache } from "react";

import type { PlanTier } from "@/lib/generated/prisma/enums";
import type { RecruiterOnboardingInput } from "@/lib/validations/recruiter";

import { prisma } from "./client";

/**
 * The plan a recruiter's entitlements derive from. Only a live subscription
 * (ACTIVE or TRIALING) counts — PAST_DUE and CANCELED fall back to FREE.
 */
export async function getRecruiterPlan(userId: string): Promise<PlanTier> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true },
  });
  if (!sub) return "FREE";
  return sub.status === "ACTIVE" || sub.status === "TRIALING" ? sub.plan : "FREE";
}

/**
 * Prisma access for recruiter profiles. Business logic (slug generation, role
 * checks, logo upload) lives in the service layer.
 */

/**
 * The full public company profile for /companies/[slug]. Public fields only.
 * Reviews are those RECEIVED (authored by the freelancer side): latest 20 for
 * display plus an accurate aggregate. Also returns the count of currently-
 * ACTIVE jobs. cache() dedupes the metadata + page calls into one query.
 */
export const getPublicRecruiterBySlug = cache(async (slug: string) => {
  const company = await prisma.recruiterProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      companyName: true,
      companyDomain: true,
      websiteUrl: true,
      linkedinUrl: true,
      logoUrl: true,
      description: true,
      country: true,
      tier: true,
      verifiedAt: true,
      isBanned: true,
      createdAt: true,
      reviewsReceived: {
        select: {
          id: true,
          rating: true,
          body: true,
          createdAt: true,
          authorFreelancer: { select: { displayName: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      _count: { select: { jobs: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!company) return null;

  const stats = await prisma.review.aggregate({
    where: { subjectRecruiterId: company.id },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return {
    ...company,
    reviewStats: { average: stats._avg.rating, count: stats._count._all },
  };
});

export type PublicRecruiter = NonNullable<Awaited<ReturnType<typeof getPublicRecruiterBySlug>>>;

/** Existing recruiter slugs equal to `base` or starting with `base-`. */
export async function findRecruiterSlugsLike(base: string): Promise<Set<string>> {
  const rows = await prisma.recruiterProfile.findMany({
    where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

export type CreateRecruiterProfileArgs = {
  userId: string;
  slug: string;
  input: RecruiterOnboardingInput;
  logoUrl: string | null;
};

/**
 * Creates the recruiter profile. tier is left to its schema default
 * (UNVERIFIED) — new recruiters are never created verified. The unique
 * constraints on userId and slug are the last line of defence against a
 * double submit or a slug race; a conflict throws for the service to map.
 */
export async function createRecruiterProfile(
  args: CreateRecruiterProfileArgs,
): Promise<{ id: string; slug: string }> {
  const { userId, slug, input, logoUrl } = args;
  return prisma.recruiterProfile.create({
    data: {
      userId,
      slug,
      companyName: input.companyName,
      companyDomain: input.companyDomain,
      registrationNo: input.registrationNo,
      linkedinUrl: input.linkedinUrl,
      websiteUrl: input.websiteUrl,
      description: input.description,
      country: input.country,
      logoUrl,
    },
    select: { id: true, slug: true },
  });
}
