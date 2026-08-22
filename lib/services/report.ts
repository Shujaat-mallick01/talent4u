import {
  countOpenReportsForUser,
  createReportTx,
  getReportableCompany,
  getReportableJob,
  hasOpenReportForTarget,
} from "@/lib/db/report";
import { REPORT_REASON_TO_FLAG, reportSchema, type ReportInput } from "@/lib/validations/report";

/**
 * User reports.
 *
 * CLAUDE.md gives the automated scanner a list of phrases to hold posts on, and
 * a public /removed-employers page to publish what moderation decided. Between
 * the two there was nothing: no way for the person who actually got asked for a
 * "security deposit" in wording the regex has never seen to tell anyone. This
 * service is that path, and it is the only thing that writes a Report row.
 *
 * What it will not do:
 *  - accept a target that does not exist. A queue full of ids that resolve to
 *    nothing is a queue a moderator stops reading, which costs more than the
 *    reports it loses.
 *  - accept an unbounded number of reports from one person. There is no rate
 *    limiter, no queue and no cache in this stack, so the limit is expressed in
 *    the data we already have: five OPEN reports at a time, and one open report
 *    per person per target. Both clear themselves as moderation works through
 *    the queue, so an honest reporter is never permanently capped.
 *  - decide anything. Status stays OPEN; a human resolves it.
 *
 * Being signed in is enforced by requireUser in app/report/actions.ts, before
 * this is called. The userId here is always a verified session's.
 */

/** Open reports one person may hold at once. Clears as moderation resolves them. */
export const MAX_OPEN_REPORTS_PER_USER = 5;

export type CreateReportResult =
  | { ok: true; reportId: string }
  | { ok: false; reason: "invalid" | "target-not-found" | "duplicate" | "too-many-open" };

/**
 * Files one report. Input is re-validated here rather than trusted from the
 * action: this is the function that writes the row, so this is where the reason
 * enum and the 2,000-character ceiling have to be true.
 */
export async function createReportForUser(
  userId: string,
  input: ReportInput,
): Promise<CreateReportResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const { targetType, targetId, reason, details } = parsed.data;

  const target =
    targetType === "job" ? await getReportableJob(targetId) : await getReportableCompany(targetId);
  if (!target) return { ok: false, reason: "target-not-found" };

  // Duplicate before cap: it is the more specific answer, and telling someone
  // "you already reported this" is more useful than "you have five open".
  if (await hasOpenReportForTarget(userId, targetType, targetId)) {
    return { ok: false, reason: "duplicate" };
  }

  const open = await countOpenReportsForUser(userId);
  if (open >= MAX_OPEN_REPORTS_PER_USER) return { ok: false, reason: "too-many-open" };

  const created = await createReportTx(
    {
      reportedById: userId,
      targetType,
      targetId,
      // Stored in the moderator's vocabulary, not the reporter's — see
      // REPORT_REASON_TO_FLAG.
      reason: REPORT_REASON_TO_FLAG[reason],
      details: details && details.length > 0 ? details : null,
    },
    MAX_OPEN_REPORTS_PER_USER,
  );

  // The transaction re-checks both limits under a lock, so it can refuse a
  // request that got past the checks above by racing another submit.
  if (!created.ok) return created;
  return { ok: true, reportId: created.id };
}
