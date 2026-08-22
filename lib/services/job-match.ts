import { cache } from "react";

import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

/**
 * Skill match between the signed-in freelancer and a job.
 *
 * This is what puts the Match Meter — the brand's signature element — onto
 * real surfaces. Upwork buries fit behind a paywalled "match" black box;
 * ours is transparent arithmetic the freelancer can verify against their own
 * profile: which of the job's listed skills do you have.
 *
 * Deliberately simple and honest. No weighting, no inferred adjacency, no
 * pretence of understanding a CV. When the score says 3 of 4, the page can
 * name the three and the one, and a freelancer who disagrees can fix their
 * profile's skill list and watch every score change.
 */

export type JobSkillRef = { skill: { slug: string; name: string } };

export type JobMatch = {
  /** 0–100, for the MatchMeter. */
  score: number;
  matched: string[];
  missing: string[];
};

/**
 * The current viewer's skill slugs, or null when they are not a freelancer
 * with a profile. Request-cached: browse computes a match for every row in
 * one render, and this must cost one query, not one per row.
 */
export const getViewerSkillSlugs = cache(async (): Promise<Set<string> | null> => {
  const session = await getSession();
  if (!session) return null;

  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: session.userId },
    select: { skills: { select: { skill: { select: { slug: true } } } } },
  });
  if (!profile) return null;
  return new Set(profile.skills.map((s) => s.skill.slug));
});

/**
 * Pure scorer, so the arithmetic is unit-testable without a session.
 * A job listing no skills matches nobody and everybody; it returns null
 * rather than a fake 100.
 */
export function scoreJobMatch(
  viewerSkills: Set<string>,
  jobSkills: JobSkillRef[],
): JobMatch | null {
  if (jobSkills.length === 0) return null;

  const matched: string[] = [];
  const missing: string[] = [];
  for (const ref of jobSkills) {
    (viewerSkills.has(ref.skill.slug) ? matched : missing).push(ref.skill.name);
  }

  return {
    score: Math.round((matched.length / jobSkills.length) * 100),
    matched,
    missing,
  };
}
