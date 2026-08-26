import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { EngageableApplication } from "@/lib/db/engagement";
import type { EngagementSide } from "@/lib/services/engagement-state";

import { proposeEngagement } from "@/app/dashboard/engagements/actions";

import { RECORD_ANCHOR, TermsFields } from "./engagement-list";

/**
 * Records a completed engagement. The picker only offers applications the
 * viewer is already a party to and that have no engagement yet — and the
 * service re-derives both parties from the chosen application, so the option
 * list is convenience, not authorization.
 *
 * Filing is a claim about another person, so the consequence is stated above
 * the button: they see these exact figures, nothing publishes until they agree
 * to them, and a refusal is final.
 */
export function ProposeEngagement({
  applications,
  side,
}: {
  applications: EngageableApplication[];
  side: EngagementSide;
}) {
  if (applications.length === 0) {
    return (
      <div id={RECORD_ANCHOR}>
        <EmptyState
          title="Nothing to record yet"
          guidance={
            side === "FREELANCER"
              ? "An engagement is recorded against a job you applied to. Apply to one, and once the work is done come back here to state the rate and the weeks."
              : "An engagement is recorded against an application to one of your jobs. Every application you have is already claimed, or you have not received one yet."
          }
          action={
            side === "FREELANCER" ? (
              <Button render={<Link href="/jobs">Browse jobs</Link>} />
            ) : (
              <Button render={<Link href="/dashboard/recruiter/jobs/new">Post a job</Link>} />
            )
          }
        />
      </div>
    );
  }

  const pickerId = "record-application";
  const pickerHint =
    side === "FREELANCER"
      ? "Only jobs you applied to that have no engagement recorded yet."
      : "Only applications to your jobs that have no engagement recorded yet.";
  const counterparty = side === "FREELANCER" ? "The company" : "The freelancer";

  return (
    <form id={RECORD_ANCHOR} action={proposeEngagement} className="surface-card p-5 sm:p-6">
      <Field
        label="Which work?"
        htmlFor={pickerId}
        hint={pickerHint}
        required
        className="max-w-xl"
      >
        <Select id={pickerId} name="applicationId" required defaultValue="">
          <option value="" disabled>
            Choose an application…
          </option>
          {applications.map((app) => (
            <option key={app.id} value={app.id}>
              {side === "FREELANCER"
                ? `${app.job.title} — ${app.job.recruiter.companyName}`
                : `${app.freelancer.displayName} — ${app.job.title}`}
            </option>
          ))}
        </Select>
      </Field>

      <TermsFields idPrefix="record" className="mt-4" />

      <p className=" mt-4 text-[15px] leading-[22px] text-muted-foreground">
        {counterparty} sees these exact figures and answers yes or no. Nothing publishes and no
        review opens until they confirm the same rate and duration — and if they decline, neither
        of you can file this claim again.
      </p>

      <Button type="submit" className="mt-4">
        Record engagement
      </Button>
    </form>
  );
}
