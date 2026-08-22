import { prisma } from "./client";

/**
 * Prisma access for account settings. No business logic here — the service
 * layer decides what a change means; this file only reads and writes.
 *
 * The two visibility writers below are conditional updates rather than
 * unconditional ones, which is what makes deactivate/reactivate idempotent at
 * the database rather than only in the service: deactivating twice must not
 * move the timestamp forward, and the recruiter reactivation predicate carries
 * `isBanned: false` so a moderator's ban still wins even if two requests race.
 */

/**
 * Everything the settings screen needs in one PK lookup: the account, the
 * billing country regional pricing reads, and whichever profile row this user
 * owns — including a recruiter's ban flag and their live post count, because
 * deactivating a company page does not close its jobs and the screen has to
 * say so with a real number.
 */
export async function getAccountSettingsRow(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      role: true,
      billingCountry: true,
      freelancer: {
        select: { id: true, slug: true, displayName: true, deactivatedAt: true },
      },
      recruiter: {
        select: {
          id: true,
          slug: true,
          companyName: true,
          deactivatedAt: true,
          isBanned: true,
          _count: { select: { jobs: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });
}

export type AccountSettingsRow = NonNullable<Awaited<ReturnType<typeof getAccountSettingsRow>>>;

/**
 * Writes the billing country. Returns false when no row matched, which for a
 * PK-scoped update means the account is gone.
 */
export async function updateBillingCountry(userId: string, country: string): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { id: userId },
    data: { billingCountry: country },
  });
  return result.count === 1;
}

/**
 * Sets or clears the freelancer's deactivation timestamp. Returns whether a
 * row actually changed — false means it was already in the requested state.
 */
export async function setFreelancerDeactivated(userId: string, at: Date | null): Promise<boolean> {
  const result = await prisma.freelancerProfile.updateMany({
    where: at === null ? { userId, deactivatedAt: { not: null } } : { userId, deactivatedAt: null },
    data: { deactivatedAt: at },
  });
  return result.count === 1;
}

/**
 * The same for a recruiter, with one extra clause: reactivation requires
 * `isBanned: false`. A removed employer clearing their own deactivatedAt would
 * otherwise be a self-service route back onto the public site, and the ban is
 * a moderator's fact about them, not theirs about themselves.
 */
export async function setRecruiterDeactivated(userId: string, at: Date | null): Promise<boolean> {
  const result = await prisma.recruiterProfile.updateMany({
    where:
      at === null
        ? { userId, deactivatedAt: { not: null }, isBanned: false }
        : { userId, deactivatedAt: null },
    data: { deactivatedAt: at },
  });
  return result.count === 1;
}
