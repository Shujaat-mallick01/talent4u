-- Engagement decline.
--
-- Mutual confirmation needs a "no". Without one, a counterparty's only options
-- are to confirm a claim they dispute or to leave it pending forever, and the
-- proposer can re-file the same claim indefinitely.
--
--   declinedAt : set when the party who did NOT propose refuses the claim.
--                Terminal, and disjoint from confirmation by the CHECK below.
--
-- The anti-abuse work is done by the pre-existing
-- Engagement_recruiterId_freelancerId_jobId_key: a declined row STAYS, so the
-- same (recruiter, freelancer, job) claim cannot be proposed a second time.
-- Deleting on decline would have reopened that loop.
--
-- Never rendered publicly. One side asserting "we never worked together" is
-- not a finding we can stand behind in front of third parties.
--
-- NOTE: `prisma migrate diff` also proposed dropping the four
-- review_*_is_engagement_party foreign keys and altering FreelancerProfile
-- .searchVector. Both are hand-written DDL the differ cannot model (see the
-- EXCEPTIONS note in the init migration), and those statements were removed by
-- hand — dropping them would reopen the third-party-review hole and break the
-- generated tsvector column.

-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN "declinedAt" TIMESTAMP(3);

-- A declined engagement can never also be a confirmed one. The service refuses
-- it too; this makes it true for any client, including psql.
ALTER TABLE "Engagement"
  ADD CONSTRAINT "engagement_declined_not_confirmed"
  CHECK ("declinedAt" IS NULL OR "isConfirmed" = false);
