-- Freelancer verification, and self-service deactivation for both sides.
--
-- FreelancerProfile.verificationSubmittedAt / verificationNote / verifiedAt
--   The freelancer verification queue, mirroring RecruiterProfile's exactly.
--   The FreelancerVerification enum, the ID_VERIFIED and ID_AND_WORK_VERIFIED
--   badges and their copy all already existed, but nothing could ever set
--   them — so every freelancer wore a permanent "Not verified" mark next to
--   their name, which is the same signal the product teaches people to
--   distrust on an employer. These give the state somewhere to come from.
--
-- FreelancerProfile.deactivatedAt / RecruiterProfile.deactivatedAt
--   Taking your public page down, which is not the same as deleting an
--   account. A freelancer's profile carries their real name, country and rate
--   and is unconditionally indexed; someone employed full-time who freelances
--   on the side had no way to remove it. Deactivation hides the public
--   surface while leaving shared history — applications, engagements, and the
--   reviews other people wrote — intact, because erasing those would rewrite
--   somebody else's record, not just your own.
--
--   Distinct from isBanned on purpose: a ban is a moderator's finding and is
--   published on /removed-employers. Deactivation is the person's own choice
--   and is published nowhere.
--
-- Written to be re-runnable (IF NOT EXISTS / DROP IF EXISTS): the first
-- attempt added the columns and then failed on the CHECK, because rows already
-- carried a verification level with no timestamp to justify it. The backfill
-- below is the fix, and it has to run before the constraint exists.
--
-- NOTE: `prisma migrate diff` also proposed dropping the four
-- review_*_is_engagement_party foreign keys and altering FreelancerProfile
-- .searchVector. Both are hand-written DDL the differ cannot model (see the
-- EXCEPTIONS note in the init migration), and those statements were removed by
-- hand — dropping them would reopen the third-party-review hole and break the
-- generated tsvector column.

-- AlterTable
ALTER TABLE "FreelancerProfile"
  ADD COLUMN IF NOT EXISTS "verificationSubmittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationNote" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RecruiterProfile"
  ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

-- Backfill. Rows that already carry a verification level predate the column
-- that records WHEN it was granted, so there is no true answer — createdAt is
-- used, which reads as "verified since the profile existed". That is accurate
-- for seeded data and is the most conservative reading for anything else: it
-- never claims a verification happened later than it did.
UPDATE "FreelancerProfile"
  SET "verifiedAt" = "createdAt"
  WHERE "verification" <> 'NONE' AND "verifiedAt" IS NULL;

-- And the reverse, so the constraint below holds in both directions.
UPDATE "FreelancerProfile"
  SET "verifiedAt" = NULL
  WHERE "verification" = 'NONE' AND "verifiedAt" IS NOT NULL;

-- CreateIndex — the public freelancer browse: live profiles, newest first.
CREATE INDEX IF NOT EXISTS "FreelancerProfile_deactivatedAt_createdAt_idx"
  ON "FreelancerProfile"("deactivatedAt", "createdAt" DESC);

-- A verified freelancer must have a verification timestamp, and an unverified
-- one must not — the same derivation rule the engagement CHECK enforces, so
-- the badge can never claim a state nothing recorded.
ALTER TABLE "FreelancerProfile"
  DROP CONSTRAINT IF EXISTS "freelancer_verification_has_timestamp";

ALTER TABLE "FreelancerProfile"
  ADD CONSTRAINT "freelancer_verification_has_timestamp"
  CHECK (("verification" = 'NONE') = ("verifiedAt" IS NULL));
