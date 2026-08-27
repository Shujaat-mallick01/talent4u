-- One outreach thread per job and freelancer.
--
-- Recruiter-initiated messaging from candidate search creates conversations
-- with no application behind them, so Conversation_applicationId_key — the
-- constraint that makes two simultaneous "Message" clicks produce one thread
-- instead of two — does not cover them. Those rows all carry applicationId
-- NULL, and Postgres treats NULLs as distinct, which is exactly what lets many
-- of them coexist and exactly why they are unprotected.
--
-- This restores the same guarantee by the same mechanism: a nullable key that
-- is unique when present. Application threads leave it NULL and are unaffected;
-- an outreach thread sets "<jobId>:<freelancerUserId>", so a double-submit
-- loses on the index rather than splitting the conversation in half.
--
-- Composed in the service rather than generated here because the freelancer is
-- identified through ConversationParticipant, not by a column on Conversation
-- — there is no expression over this table alone that a generated column or a
-- partial index could use.
ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "outreachKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_outreachKey_key"
  ON "Conversation" ("outreachKey");
