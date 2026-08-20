import { prisma } from "./client";

/** Category/skill lookups shared by the job and profile flows. */

export async function listCategories(): Promise<{ id: string; slug: string; name: string }[]> {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
}

/** Flat alphabetical skill list for the browse filter sidebar. */
export async function listSkillsForFilter(): Promise<{ slug: string; name: string }[]> {
  return prisma.skill.findMany({
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
}

export async function getCategoryIdBySlug(slug: string): Promise<string | null> {
  const row = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  return row?.id ?? null;
}

/** The subset of `slugs` that are real skills, with their ids. */
export async function findSkillsBySlugs(slugs: string[]): Promise<{ id: string; slug: string }[]> {
  if (slugs.length === 0) return [];
  return prisma.skill.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
}
