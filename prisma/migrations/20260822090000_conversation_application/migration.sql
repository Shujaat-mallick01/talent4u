-- One conversation per application.
--
--   Conversation.applicationId : the application a thread grew out of, unique.
--
-- A conversation is about a job between exactly two people, which is precisely
-- what an Application already identifies (it is unique on jobId+freelancerId).
-- Hanging the uniqueness here means two simultaneous "Message" clicks produce
-- one thread and one constraint violation, rather than two threads and an
-- inbox split across both — without the service having to take a lock.
--
-- Nullable on purpose. A thread does not structurally require an application:
-- recruiter-initiated outbound messaging from candidate search (a paid feature,
-- not yet built) will create threads with nothing behind them, and Postgres
-- treats NULLs as distinct in a unique index, so those will not all collide on
-- a single NULL.
--
-- SET NULL on delete rather than CASCADE: losing an application must never
-- silently delete a conversation the two parties may still be relying on. In
-- practice applications are never deleted — withdrawal is a status change.
--
-- NOTE: `prisma migrate diff` also proposed dropping the four
-- review_*_is_engagement_party foreign keys and altering FreelancerProfile
-- .searchVector. Both are hand-written DDL the differ cannot model (see the
-- EXCEPTIONS note in the init migration), and those statements were removed by
-- hand — dropping them would reopen the third-party-review hole and break the
-- generated tsvector column.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "applicationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_applicationId_key" ON "Conversation"("applicationId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
