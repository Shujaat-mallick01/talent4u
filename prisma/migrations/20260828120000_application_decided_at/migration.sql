-- When a decision was actually made.
--
-- The "do applicants hear anything back?" metric had to use
-- Application.updatedAt as a stand-in, because nothing recorded the moment a
-- recruiter shortlisted or rejected somebody. updatedAt is "the row last
-- changed" — a private note written months later moves it, which pushes the
-- decision outside the 30-day window and makes the product look worse than it
-- is. The bias was at least in the safe direction, but a health metric that is
-- knowingly wrong is a metric people stop trusting.
--
-- Written once, by setApplicationStatusForUser, at the moment the status moves
-- to SHORTLISTED or REJECTED. Never updated afterwards.
--
-- Existing rows are deliberately NOT backfilled. There is no honest value to
-- backfill WITH — updatedAt is exactly the approximation this column replaces,
-- and copying it in would launder a guess into what looks like a fact. The
-- metric reads COALESCE(decidedAt, updatedAt), so history keeps its old
-- approximation and everything from here is exact.
ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
