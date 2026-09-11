import { PORTFOLIO_MAX_ITEMS } from "@/lib/validations/portfolio";

import { prisma } from "./client";

/**
 * Prisma access for portfolio items. No business logic here.
 *
 * One thing worth reading before changing anything: the add path is a
 * transaction with `SELECT … FOR UPDATE` on the freelancer's profile row, the
 * same shape the application quota and the job-post cap use. A cap that counts
 * and then inserts without a lock is not a cap — twelve concurrent submissions
 * all see eleven and all insert. It is the same bug in the same shape, so it
 * gets the same fix rather than a new one.
 */

export type PortfolioRow = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
  linkUrl: string | null;
  position: number;
};

export type AddPortfolioResult =
  | { ok: true; id: string }
  | { ok: false; reason: "cap-reached"; used: number };

/** A freelancer's items, in their chosen order. */
export async function listPortfolio(freelancerId: string): Promise<PortfolioRow[]> {
  return prisma.portfolioItem.findMany({
    where: { freelancerId },
    select: { id: true, title: true, description: true, imageUrl: true, linkUrl: true, position: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * The single cover image for a set of freelancers, for the directory grid.
 *
 * One query for the whole page, never one per card: `/freelancers` is indexed
 * SEO surface and N+1 there is paid on every crawl. DISTINCT ON takes the
 * lowest-positioned item per freelancer in one pass.
 */
export async function coverImagesFor(
  freelancerIds: readonly string[],
): Promise<Map<string, string>> {
  if (freelancerIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<{ freelancerId: string; imageUrl: string }[]>`
    SELECT DISTINCT ON ("freelancerId") "freelancerId", "imageUrl"
    FROM "PortfolioItem"
    WHERE "freelancerId" = ANY(${[...freelancerIds]}::text[])
    ORDER BY "freelancerId", "position" ASC, "createdAt" ASC
  `;
  return new Map(rows.map((r) => [r.freelancerId, r.imageUrl]));
}

/**
 * Adds an item, refusing past the cap.
 *
 * The new item goes last: position is one past the current maximum, so adding
 * never silently reorders what is already there.
 */
export async function addPortfolioItemTx(args: {
  freelancerId: string;
  title: string;
  description: string | null;
  imageUrl: string;
  linkUrl: string | null;
}): Promise<AddPortfolioResult> {
  const { freelancerId, ...data } = args;

  return prisma.$transaction(async (tx) => {
    // Serializes this freelancer's adds. Same lock the quota and the post cap
    // take, on the same row.
    await tx.$queryRaw`SELECT "id" FROM "FreelancerProfile" WHERE "id" = ${freelancerId} FOR UPDATE`;

    const used = await tx.portfolioItem.count({ where: { freelancerId } });
    if (used >= PORTFOLIO_MAX_ITEMS) {
      return { ok: false, reason: "cap-reached", used } as const;
    }

    const last = await tx.portfolioItem.aggregate({
      where: { freelancerId },
      _max: { position: true },
    });

    const created = await tx.portfolioItem.create({
      data: { freelancerId, ...data, position: (last._max.position ?? -1) + 1 },
      select: { id: true },
    });
    return { ok: true, id: created.id } as const;
  });
}

/**
 * Deletes one item the caller owns. Returns whether a row went.
 *
 * Scoped by freelancerId in the WHERE, so an id belonging to somebody else
 * matches nothing rather than being refused — ownership is unrepresentable to
 * forge, not merely checked. The service reads the row first for its image URL
 * and then calls this; a zero count means it was already gone.
 */
export async function deletePortfolioItem(freelancerId: string, id: string): Promise<boolean> {
  const { count } = await prisma.portfolioItem.deleteMany({ where: { id, freelancerId } });
  return count > 0;
}

/** The row, if it belongs to this freelancer. */
export async function getOwnedPortfolioItem(
  freelancerId: string,
  id: string,
): Promise<PortfolioRow | null> {
  return prisma.portfolioItem.findFirst({
    where: { id, freelancerId },
    select: { id: true, title: true, description: true, imageUrl: true, linkUrl: true, position: true },
  });
}

/**
 * Rewrites positions from an ordered list of ids.
 *
 * Scoped by freelancerId on every update, so an id from another profile
 * updates nothing. One transaction, because a half-applied order is a visibly
 * scrambled page.
 */
export async function reorderPortfolio(freelancerId: string, ids: readonly string[]): Promise<number> {
  return prisma.$transaction(async (tx) => {
    let moved = 0;
    for (const [index, id] of ids.entries()) {
      const { count } = await tx.portfolioItem.updateMany({
        where: { id, freelancerId },
        data: { position: index },
      });
      moved += count;
    }
    return moved;
  });
}

/** Every image URL a freelancer holds — for account deletion's storage cleanup. */
export async function portfolioImageUrls(freelancerId: string): Promise<string[]> {
  const rows = await prisma.portfolioItem.findMany({
    where: { freelancerId },
    select: { imageUrl: true },
  });
  return rows.map((r) => r.imageUrl);
}

/**
 * How many engagements this freelancer has had confirmed by BOTH sides.
 *
 * The public proof number, and the honest substitute for the "$1M+ earned"
 * every other marketplace leads with. Talent4u never holds or transmits money,
 * so it genuinely does not know what anyone earned — a figure here would be
 * self-reported, and an unverifiable money claim on a trust-led profile would
 * undercut the one thing the product is selling.
 *
 * This number is the opposite: `isConfirmed` is derived by a database trigger
 * from two party booleans and re-asserted by a CHECK, so neither side can set
 * it alone and no application code can write it by hand. It is the only stat
 * on the page that is expensive to fake.
 */
export async function countConfirmedEngagements(freelancerId: string): Promise<number> {
  return prisma.engagement.count({ where: { freelancerId, isConfirmed: true } });
}
