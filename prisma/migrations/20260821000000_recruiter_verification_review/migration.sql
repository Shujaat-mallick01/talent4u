-- Recruiter verification review queue.
--
--   verificationSubmittedAt : set when a recruiter submits for review,
--                             cleared on an admin decision. UNVERIFIED with a
--                             non-null value = pending in the admin queue.
--   verificationNote        : the admin's reason on rejection, shown back to
--                             the recruiter so they know what to fix.
--
-- NOTE: `prisma migrate diff` also proposed dropping the four
-- review_*_is_engagement_party foreign keys and altering FreelancerProfile
-- .searchVector. Both are hand-written DDL the differ cannot model (see the
-- EXCEPTIONS note in the init migration), and those statements were removed
-- by hand — dropping them would reopen the third-party-review hole and break
-- the generated tsvector column.

-- AlterTable
ALTER TABLE "RecruiterProfile"
  ADD COLUMN "verificationSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "verificationNote" TEXT;
