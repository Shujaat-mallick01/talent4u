import { unstable_cache } from "next/cache";

import { prisma } from "./client";

/**
 * Public marketing counts for the landing page. Cached for 5 minutes —
 * exact freshness is immaterial to the copy, and the page itself stays
 * dynamic for the auth-aware header, so without this every anonymous visit
 * would pay three count(*) queries.
 */
export const getPublicStats = unstable_cache(
  async () => {
    const [activeJobs, freelancers, companies] = await Promise.all([
      prisma.job.count({ where: { status: "ACTIVE" } }),
      prisma.freelancerProfile.count(),
      prisma.recruiterProfile.count({ where: { isBanned: false } }),
    ]);
    return { activeJobs, freelancers, companies };
  },
  ["public-stats"],
  { revalidate: 300 },
);
