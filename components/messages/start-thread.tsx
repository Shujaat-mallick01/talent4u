import Link from "next/link";

import { startConversation } from "@/app/dashboard/messages/actions";
import { Button } from "@/components/ui/button";
import { IconMessage } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";

/**
 * The entry into messaging, from a row that already represents a relationship
 * between two people — an application.
 *
 * Three states:
 *  - a thread exists: link into it
 *  - no thread and the viewer may open one: a compose disclosure
 *  - no thread and they may not (an unverified company): say why, and say what
 *    lifts it, rather than showing a control that would be refused
 *
 * The gate rendered here is cosmetic. startConversationForUser re-decides it
 * server-side, which is what a direct POST meets.
 */
export function StartThread({
  applicationId,
  conversationId,
  canInitiate,
  counterpartyName,
  returnTo,
  compact = false,
}: {
  applicationId: string;
  /** Set when a thread already exists for this application. */
  conversationId?: string;
  canInitiate: boolean;
  counterpartyName: string;
  /** Where an empty-message error should bounce back to. */
  returnTo: string;
  compact?: boolean;
}) {
  if (conversationId) {
    return (
      <Button
        size={compact ? "sm" : "default"}
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
        <Link
          href="/dashboard/recruiter/verification"
          className="rounded-xs underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Verify to message first
        </Link>
      </p>
    );
  }

  return (
    <details className="w-full">
      <summary className="t-label inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <IconMessage className="size-4" />
        Message {counterpartyName}
      </summary>
      <form action={startConversation} className="mt-2">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Textarea
          name="body"
          rows={3}
          maxLength={5000}
          required
          aria-label={`Message to ${counterpartyName}`}
          placeholder={`Write to ${counterpartyName}…`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="secondary">
            Send message
          </Button>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            Contact details are fine to share — we do not restrict that.
          </p>
        </div>
      </form>
    </details>
  );
}
