import { Button } from "@/components/ui/button";
import type { EngageableApplication } from "@/lib/db/engagement";
import type { EngagementSide } from "@/lib/services/engagement-state";

import { proposeEngagement } from "@/app/dashboard/engagements/actions";

import { TermsFields } from "./engagement-list";

/**
 * Records a completed engagement. The picker only offers applications the
 * viewer is already a party to and that have no engagement yet — and the
 * service re-derives both parties from the chosen application, so the option
 * list is convenience, not authorization.
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
      <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
        {side === "FREELANCER"
          ? "Engagements are recorded against a job you applied to. Once you have applied and the work is done, come back here to record it."
          : "Engagements are recorded against an application to one of your jobs. Every application you have already has one, or you have none yet."}
      </p>
    );
  }

  return (
    <form action={proposeEngagement} className="border border-border p-4">
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Which work?
        </span>
        <select
          name="applicationId"
          required
          defaultValue=""
          className="mt-1 h-9 w-full rounded-[2px] border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
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
        </select>
      </label>

      <div className="mt-3">
        <TermsFields />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm">
          Record engagement
        </Button>
        <p className="text-xs text-muted-foreground">
          {side === "FREELANCER"
            ? "The company has to confirm these exact figures before anything is published."
            : "The freelancer has to confirm these exact figures before anything is published."}
        </p>
      </div>
    </form>
  );
}
