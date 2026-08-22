import Link from "next/link";

import { submitReport } from "@/app/report/actions";
import { Button } from "@/components/ui/button";
import { ChoiceRow, Radio } from "@/components/ui/choice";
import { Field, fieldControlProps } from "@/components/ui/field";
import { IconFlag } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportTargetType,
} from "@/lib/validations/report";

/**
 * The report control: a <details> disclosure, no JS dialog and no client
 * component. It sits at the bottom of a job or company page and stays closed
 * until someone means it.
 *
 * Styled quiet on purpose. This is a safety valve, not a call to action — a
 * red button labelled "Report" next to an apply form invites the misfires that
 * make a moderation queue useless. The one affirmative control inside is Ink,
 * so Signal Red stays on the action the page is actually for.
 *
 * Logged-out visitors see the control and the reason it needs an account,
 * rather than a form that would bounce them. The gate is cosmetic either way:
 * submitReport calls requireUser before it reads anything.
 */

const DETAILS_HINT = "What you saw, and where. Never paste passwords or bank details.";

export function ReportDialog({
  targetType,
  targetId,
  slug,
  signedIn,
}: {
  targetType: ReportTargetType;
  /** The row id being reported. Verified server-side before anything is filed. */
  targetId: string;
  /** The public slug of the page this sits on — the outcome redirects back to it. */
  slug: string;
  signedIn: boolean;
}) {
  const noun = targetType === "job" ? "post" : "company";
  // Who the report is about, for the line promising we will not name the
  // reporter to them. "The employer" for a post, since a post is not a person.
  const them = targetType === "job" ? "the employer" : "the company";
  // The verb that opens the flow is the verb that confirms it.
  const label = `Report this ${noun}`;
  const detailsId = `report-${targetType}-details`;
  const path = targetType === "job" ? `/jobs/${slug}` : `/companies/${slug}`;

  return (
    <details className="border-t border-border pt-6">
      <summary className="t-label inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[2px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <IconFlag className="size-4" />
        {label}
      </summary>

      {signedIn ? (
        <form action={submitReport} className="measure mt-4 space-y-5">
          {/* The target travels as ids the server re-resolves; nothing here
              names a status, a severity or an outcome. */}
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="slug" value={slug} />

          <fieldset>
            <legend className="t-label text-muted-foreground">What happened?</legend>
            <div className="mt-1">
              {REPORT_REASONS.map((key) => (
                <ChoiceRow key={key}>
                  <Radio name="reason" value={key} required />
                  {REPORT_REASON_LABELS[key]}
                </ChoiceRow>
              ))}
            </div>
          </fieldset>

          <Field
            label="Anything a moderator should know"
            htmlFor={detailsId}
            hint={DETAILS_HINT}
            optional
          >
            <Textarea
              {...fieldControlProps(detailsId, { hint: DETAILS_HINT })}
              name="details"
              rows={3}
              maxLength={2000}
              placeholder="They asked for a $50 equipment deposit before the interview…"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" size="sm" variant="secondary">
              {label}
            </Button>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              A person reads every report. We never tell {them} who reported them, and nothing you
              write here appears on their page.
            </p>
          </div>
        </form>
      ) : (
        <p className="measure mt-4 text-[13px] leading-[18px] text-muted-foreground">
          Reporting takes an account, so a moderator can come back to you and so the same report
          cannot be filed a thousand times.{" "}
          <Link
            href={`/signin?next=${encodeURIComponent(path)}`}
            className="rounded-[2px] underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Sign in
          </Link>{" "}
          — you come straight back to this page. A person reads every report, and we never tell{" "}
          {them} who reported them.
        </p>
      )}
    </details>
  );
}
