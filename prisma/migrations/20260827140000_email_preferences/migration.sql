-- Email preferences, and the prerequisite for sending anything that is not
-- strictly transactional.
--
-- Everything the product mails today is about something that just happened to
-- the recipient's own account, triggered by another person — an application
-- arriving, a decision, a message. That is why none of it carries an
-- unsubscribe link and why none of it needs one. A weekly digest of jobs is a
-- different kind of mail: nobody asked for it at the moment it arrives, and it
-- must be refusable in one click, by someone who is not signed in, from their
-- mail client.
--
-- Three columns, and each answers one of those requirements:
--
--   jobDigestOptIn    the preference itself, mirrored by a settings toggle.
--                     Defaults true: a freelancer signed up to be shown work,
--                     and the mail is refusable from every copy of it.
--   unsubscribeToken  lets the link in the footer work with no session. Filled
--                     lazily the first time a digest is sent rather than
--                     backfilled, so no token exists for an account that has
--                     never been mailed one.
--   lastJobDigestAt   what makes the weekly send idempotent. The job selects
--                     on it, so a retry, an overlapping run, or a cron that
--                     fires twice cannot mail the same person twice.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "jobDigestOptIn"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "unsubscribeToken" TEXT,
  ADD COLUMN IF NOT EXISTS "lastJobDigestAt"  TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_unsubscribeToken_key"
  ON "User" ("unsubscribeToken");

-- The digest job's own query: opted-in accounts that are due, oldest first.
CREATE INDEX IF NOT EXISTS "User_jobDigestOptIn_lastJobDigestAt_idx"
  ON "User" ("jobDigestOptIn", "lastJobDigestAt");
