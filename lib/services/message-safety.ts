import { flagMessage } from "@/lib/db/safety";

import { scanTextForSafetyFlags, type SafetyMatch } from "./safety";

/**
 * Message-side of the automated scanner. CLAUDE.md holds "a post OR message"
 * containing the trigger categories, so messaging (Phase 6) routes every
 * outbound body through here on write.
 *
 * Deliberately different from the job path: a job is held BEFORE it becomes
 * public (PENDING_REVIEW, never auto-published), but a message has already
 * been delivered by the time it is scanned. Flagging therefore marks the row
 * and opens a moderation entry rather than retracting it — the moderator
 * decides. Callers that want to block delivery instead should call
 * scanTextForSafetyFlags first and refuse before persisting.
 */

export type MessageScanResult =
  | { flagged: false }
  | { flagged: true; match: SafetyMatch; recorded: boolean };

export async function scanMessageOnWrite(
  messageId: string,
  body: string,
): Promise<MessageScanResult> {
  const match = scanTextForSafetyFlags(body);
  if (!match) return { flagged: false };

  const recorded = await flagMessage({
    messageId,
    reason: match.reason,
    matchedTerm: match.matchedTerm,
  });
  return { flagged: true, match, recorded };
}
