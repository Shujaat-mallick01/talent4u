/**
 * Profile strength — the meter the brand guide's own interface kit specifies
 * ("Profile strength · 78%") and LinkedIn made table stakes.
 *
 * Pure arithmetic over the profile the caller already loaded: no query, no
 * opinion a person cannot verify. Each item is worth its weight because of
 * what it does FOR the freelancer in this product specifically — the copy on
 * every item says what completing it changes, not "complete your profile" as
 * an end in itself.
 */

export type StrengthInput = {
  headline: string;
  bio: string;
  hourlyRateUsd: number | null;
  avatarUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  skillCount: number;
  /** The "approved:" marker or a reviewer note — presence of any review activity. */
  verificationSubmittedAt: Date | null;
  verificationNote: string | null;
};

export type StrengthItem = {
  key: string;
  label: string;
  /** What completing this actually changes, in this product. */
  why: string;
  weight: number;
  done: boolean;
};

export type ProfileStrength = {
  /** 0–100. */
  percent: number;
  items: StrengthItem[];
  /** The highest-weight incomplete item — the one thing to do next. */
  next: StrengthItem | null;
};

export function profileStrength(input: StrengthInput): ProfileStrength {
  const items: StrengthItem[] = [
    {
      key: "bio",
      label: "A bio of 300+ characters",
      why: "The first thing a company reads before deciding whether to reply.",
      weight: 20,
      done: input.bio.trim().length >= 300,
    },
    {
      key: "skills",
      label: "5 or more skills",
      why: "Skills are what the match score and candidate search run on.",
      weight: 20,
      done: input.skillCount >= 5,
    },
    {
      key: "work-link",
      label: "A link to real work",
      why: "GitHub, a portfolio, or LinkedIn — proof beats prose, and it is what verification reviews.",
      weight: 20,
      done: Boolean(input.githubUrl || input.portfolioUrl || input.linkedinUrl),
    },
    {
      key: "rate",
      label: "A stated hourly rate",
      why: "Profiles with a rate get approached with real numbers instead of “what's your budget”.",
      weight: 15,
      done: input.hourlyRateUsd !== null,
    },
    {
      key: "headline",
      label: "A specific headline",
      why: "“Senior Shopify developer for high-volume stores” beats “Developer” in every list you appear in.",
      weight: 15,
      // Specific enough to say something: not just one word.
      done: input.headline.trim().split(/\s+/).length >= 3,
    },
    {
      key: "verification",
      label: "Work links submitted for review",
      why: "A reviewed profile is the closest thing to a badge until ID verification launches.",
      weight: 10,
      done: input.verificationSubmittedAt !== null || input.verificationNote !== null,
    },
  ];

  const total = items.reduce((n, i) => n + i.weight, 0);
  const earned = items.reduce((n, i) => n + (i.done ? i.weight : 0), 0);
  const incomplete = items.filter((i) => !i.done).sort((a, b) => b.weight - a.weight);

  return {
    percent: Math.round((earned / total) * 100),
    items,
    next: incomplete[0] ?? null,
  };
}
