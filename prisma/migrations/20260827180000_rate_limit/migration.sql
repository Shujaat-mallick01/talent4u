-- Rate limiting, in Postgres.
--
-- Every mutation in this product runs on serverless functions, so an in-memory
-- counter is worse than none: each instance keeps its own, and the effective
-- limit becomes the real one multiplied by however many instances happen to be
-- warm. The usual answer is Redis. CLAUDE.md rules out introducing a cache
-- layer, and for this workload it would be a whole new dependency to run,
-- pay for and monitor in order to count to ten.
--
-- So it is a table. One row per (action, subject), holding a fixed window:
-- when the window has expired the counter resets, otherwise it increments.
-- Both branches happen in ONE statement — INSERT ... ON CONFLICT DO UPDATE —
-- so two simultaneous requests cannot both read "1 so far" and both write "2".
-- A read-then-write here would let a burst through precisely when a burst is
-- the thing being defended against.
--
-- The key is hashed by the caller, never raw: it holds an email address or an
-- IP, and neither belongs in a table that is not otherwise personal data.
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key"         TEXT         NOT NULL,
    "count"       INTEGER      NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- Expired rows are dead weight; this is what the pruner scans.
CREATE INDEX IF NOT EXISTS "RateLimit_windowStart_idx"
  ON "RateLimit" ("windowStart");
