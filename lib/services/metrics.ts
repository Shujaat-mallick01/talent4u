import {
  freelancersWhoHeardBack,
  jobsWithEarlyTraction,
  marketplaceScale,
  recruitersWhoPostedAgain,
  type Ratio,
} from "@/lib/db/metrics";
import { getUserAuthState } from "@/lib/db/users";

/**
 * The health dashboard, and the gate in front of it.
 *
 * Admin only, decided from the account's own row. The numbers are aggregates
 * rather than anybody's personal data, but they are commercially sensitive —
 * "how often do applicants get ignored here" is not something a competitor,
 * or a recruiter mid-negotiation, should be able to read off a URL.
 */

export type Measure = {
  key: string;
  /** What is being measured, as a claim that can be true or false. */
  question: string;
  hit: number;
  total: number;
  /** Null when nothing has had a fair chance yet — NOT zero. */
  percent: number | null;
  /** What the denominator actually contains. */
  denominator: string;
  /** What this number does not say. */
  caveat: string;
};

export type MetricsView = {
  measures: Measure[];
  scale: Awaited<ReturnType<typeof marketplaceScale>>;
};

export type MetricsResult =
  | { ok: true; view: MetricsView }
  | { ok: false; reason: "not-admin" };

/**
 * A percentage, or null.
 *
 * Null when the denominator is empty, and the distinction matters more than it
 * looks: "0%" says everyone failed, while null says nobody has been given the
 * chance yet. Rendering the first when the second is true is how a dashboard
 * starts lying on day one.
 */
function percentOf({ hit, total }: Ratio): number | null {
  return total === 0 ? null : Math.round((hit / total) * 100);
}

export async function getMetricsForUser(userId: string): Promise<MetricsResult> {
  const account = await getUserAuthState(userId);
  if (!account || account.role !== "ADMIN") return { ok: false, reason: "not-admin" };

  const [traction, repeat, heardBack, scale] = await Promise.all([
    jobsWithEarlyTraction(),
    recruitersWhoPostedAgain(),
    freelancersWhoHeardBack(),
    marketplaceScale(),
  ]);

  const measures: Measure[] = [
    {
      key: "traction",
      question: "Do posted jobs attract applicants?",
      ...traction,
      percent: percentOf(traction),
      denominator: "Jobs published more than 48 hours ago, including ones since closed.",
      caveat:
        "Counts applications, not quality. Five people applying does not mean five worth reading.",
    },
    {
      key: "repeat",
      question: "Do companies come back?",
      ...repeat,
      percent: percentOf(repeat),
      denominator: "Companies whose first published role is more than 60 days old.",
      caveat:
        "The number that decides whether this is a business. A company that hires successfully and has nobody else to hire is a success this counts as a failure.",
    },
    {
      key: "heard-back",
      question: "Do applicants hear anything back?",
      ...heardBack,
      percent: percentOf(heardBack),
      denominator: "Freelancers whose first application is more than 30 days old.",
      caveat:
        "A rejection counts — it is an answer. Being marked VIEWED does not, because that happens automatically when a recruiter opens their inbox. Understates slightly: a decision's timestamp moves if the application is edited later.",
    },
  ];

  return { ok: true, view: { measures, scale } };
}
