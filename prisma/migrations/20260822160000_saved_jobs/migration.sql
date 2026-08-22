-- Saved jobs — the bookmark every serious job board has.
--
-- The (freelancerId, jobId) primary key IS the toggle's idempotency: saving
-- twice conflicts instead of duplicating, and unsaving is a delete by the same
-- key. Cascade on both sides — a bookmark is a pure pointer, never shared
-- history, so it vanishes with either end.
--
-- NOTE: `prisma migrate diff` also proposed dropping the four
-- review_*_is_engagement_party foreign keys and altering FreelancerProfile
-- .searchVector. Both are hand-written DDL the differ cannot model (see the
-- EXCEPTIONS note in the init migration), and those statements were removed by
-- hand.

-- CreateTable
CREATE TABLE "SavedJob" (
    "freelancerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("freelancerId","jobId")
);

-- CreateIndex
CREATE INDEX "SavedJob_freelancerId_createdAt_idx"
  ON "SavedJob"("freelancerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_freelancerId_fkey"
  FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
