import { searchCandidates, type CandidateRow } from "@/lib/db/candidate-search";
import { getEntitlementContext } from "@/lib/db/users";
import { getEntitlements } from "@/lib/pricing/entitlements";
import { SITE_URL } from "@/lib/site-url";
import type { CandidateSearchFilters } from "@/lib/validations/candidate-search";

/**
 * Team-tier CSV export of a candidate search.
 *
 * WHAT IS IN IT, and why that is the whole design: only fields already public
 * on /freelancers/[slug]. No email, no account id. The export is a convenience
 * — the same rows a recruiter is already looking at, in a spreadsheet — and
 * deliberately not a contact list. Handing out addresses in bulk would move
 * the hiring conversation off-platform, and off-platform is where the safety
 * scanner cannot read the message and the engagement that unlocks reviews
 * never gets confirmed. The product's whole trust model runs on conversations
 * that happen here.
 *
 * TWO gates, not one. `candidateSearch` is the wall in front of the feature at
 * all (Growth and up); `exportCandidates` is Team-only on top of it. They are
 * read from the account's own row through the same getEntitlements every other
 * gate uses, never from the request.
 *
 * The rows come from searchCandidates with a bigger page, NOT from a query of
 * its own. That matters more than it looks: a second query would be a second
 * place for "deactivated profiles are excluded" and the ranking to be got
 * wrong, and a CSV is exactly the surface where nobody would notice.
 */

/**
 * Ceiling on one export. High enough that a real shortlist fits, low enough
 * that the endpoint cannot be turned into a bulk scrape of the directory one
 * request at a time. The caller is told when it truncates, because a silently
 * short CSV is worse than a refused one.
 */
export const EXPORT_ROW_LIMIT = 500;

export type CandidateExportResult =
  | { ok: true; csv: string; rows: number; truncated: boolean }
  | { ok: false; reason: "not-recruiter" | "banned" | "plan-required" | "team-required" };

/** The columns, in order. Adding one here is the only place it needs adding. */
const COLUMNS = [
  "Name",
  "Headline",
  "Country",
  "Timezone",
  "Hourly rate (USD)",
  "Open to work",
  "Verification",
  "Skills",
  "Profile",
] as const;

/**
 * Escapes one field for RFC 4180, and defuses formula injection.
 *
 * The second half is the one worth remembering. A cell beginning `=`, `+`, `-`
 * or `@` is evaluated as a formula when the file is opened in Excel or Sheets,
 * so a freelancer whose headline starts with `=HYPERLINK(...)` would be
 * running code in the recruiter's spreadsheet. Every value here is
 * user-written text. Prefixing with an apostrophe is the standard defusal: the
 * sheet shows the text and does not evaluate it.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

const VERIFICATION_LABEL: Record<string, string> = {
  NONE: "Not verified",
  ID_VERIFIED: "ID verified",
  ID_AND_WORK_VERIFIED: "ID and work verified",
};

/**
 * Rows to CSV. Pure, so the escaping and the column set are unit-tested
 * without a database.
 *
 * CRLF line endings and a UTF-8 BOM because the consumer is Excel: without the
 * BOM it reads UTF-8 as the local codepage and every non-ASCII name arrives
 * mangled, which on a marketplace this international is most of them.
 */
export function candidatesToCsv(rows: CandidateRow[]): string {
  const lines = [COLUMNS.map(cell).join(",")];

  for (const row of rows) {
    lines.push(
      [
        cell(row.displayName),
        cell(row.headline),
        cell(row.country),
        cell(row.timezone),
        cell(row.hourlyRateUsd),
        cell(row.isOpenToWork ? "Yes" : "No"),
        cell(VERIFICATION_LABEL[row.verification] ?? row.verification),
        cell(row.skills.map((s) => s.skill.name).join("; ")),
        cell(`${SITE_URL}/freelancers/${row.slug}`),
      ].join(","),
    );
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function exportCandidatesForUser(
  userId: string,
  filters: CandidateSearchFilters,
): Promise<CandidateExportResult> {
  const context = await getEntitlementContext(userId);
  if (!context || context.role !== "RECRUITER") return { ok: false, reason: "not-recruiter" };
  if (context.isBanned) return { ok: false, reason: "banned" };

  const entitlements = getEntitlements({
    role: context.role,
    plan: context.plan,
    recruiterTier: context.recruiterTier,
  });
  // The same wall the page hits, checked again because this is its own route.
  if (!entitlements.recruiter.candidateSearch) return { ok: false, reason: "plan-required" };
  // And Team on top of it. Nothing below this line runs for Growth.
  if (!entitlements.recruiter.exportCandidates) return { ok: false, reason: "team-required" };

  // A cursor would export one arbitrary page; an export means "these results",
  // so it always starts from the top of the ranking.
  const { candidates, hasMore } = await searchCandidates(
    { ...filters, cursor: undefined },
    EXPORT_ROW_LIMIT,
  );

  return {
    ok: true,
    csv: candidatesToCsv(candidates),
    rows: candidates.length,
    truncated: hasMore,
  };
}
