import Link from "next/link";

import { startOutreach } from "@/app/dashboard/messages/actions";
import { Button } from "@/components/ui/button";
import { IconMessage } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const LINK =
  "rounded-xs underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Writing to someone who has not applied.
 *
 * The counterpart of StartThread, and deliberately a different component: this
 * is the one place in the product where a message reaches a person who never
 * asked for one, so it carries an extra decision StartThread does not — WHICH
 * ROLE the message is about. The recipient sees that, and it is the difference
 * between a recruiter getting in touch and a stranger appearing in your inbox.
 *
 * Four states, and each says what would lift it:
 *   - a thread already exists            -> open it
 *   - unverified company                 -> verify, and why
 *   - verified but no open roles         -> publish one first
 *   - otherwise                          -> pick a role and write
 *
 * Every gate here is cosmetic. startOutreachForUser re-decides all of them
 * server-side, which is what a direct POST meets.
 */
export function StartOutreach({
  freelancerId,
  freelancerName,
  openJobs,
  canInitiate,
  conversationId,
  returnTo,
}: {
  freelancerId: string;
  freelancerName: string;
  openJobs: { id: string; title: string }[];
  /** The verification tier rule. Paying does not lift it. */
  canInitiate: boolean;
  /** Set when this recruiter has already written to this person. */
  conversationId?: string;
  returnTo: string;
}) {
  if (conversationId) {
    return (
      <Button
        size="sm"
        variant="outline"
        render={
          <Link href={`/dashboard/messages/${conversationId}`}>
            <IconMessage className="size-4" />
            Open thread
          </Link>
        }
      />
    );
  }

  if (!canInitiate) {
    return (
      <p className="t-label text-muted-foreground">
        <Link href="/dashboard/recruiter/verification" className={LINK}>
          Verify to message first
        </Link>
      </p>
    );
  }

  if (openJobs.length === 0) {
    return (
      <p className="t-label text-muted-foreground">
        <Link href="/dashboard/recruiter/jobs/new" className={LINK}>
          Publish a role to invite people to
        </Link>
      </p>
    );
  }

  const selectId = `outreach-job-${freelancerId}`;

  return (
    <details className="w-full">
      <summary className="t-label inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <IconMessage className="size-4" />
        Message {freelancerName}
      </summary>

      <form action={startOutreach} className="mt-3 max-w-xl">
        <input type="hidden" name="freelancerId" value={freelancerId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <label htmlFor={selectId} className="t-label text-muted-foreground">
          About which role
        </label>
        <Select id={selectId} name="jobId" required className="mt-1.5" defaultValue={openJobs[0].id}>
          {openJobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </Select>

        <Textarea
          name="body"
          rows={4}
          maxLength={5000}
          required
          className="mt-3"
          aria-label={`Message to ${freelancerName}`}
          placeholder={`Say what the role is and why you are writing to ${freelancerName} specifically. A message that could have gone to anyone usually does.`}
        />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="secondary">
            Send message
          </Button>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            They will see the role. Contact details are fine to share.
          </p>
        </div>
      </form>
    </details>
  );
}
