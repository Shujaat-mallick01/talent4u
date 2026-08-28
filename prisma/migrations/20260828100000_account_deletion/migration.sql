-- Self-service account deletion.
--
-- What this is NOT is a row delete, and the schema already said why: a
-- freelancer's applications, the engagements they confirmed, and the reviews
-- other people wrote about them are SHARED history. Erasing them would rewrite
-- somebody else's record — a recruiter would lose the evidence behind a hire,
-- and a review would lose the person it was about.
--
-- So deletion anonymises the person and keeps the record. The name becomes a
-- placeholder, the bio, links and avatar go, the email is replaced with an
-- address at an unroutable domain (preserving the unique index without holding
-- anything that identifies anyone), the Supabase Auth user is removed so
-- sign-in is impossible, and any live subscription is cancelled so nobody is
-- billed for an account that no longer exists.
--
-- One column records that this happened. It is what stops a deleted account
-- being treated as merely deactivated, and it is deliberately not reversible
-- from the product: undoing it would need an identity we have just destroyed.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Deleted accounts are excluded from every authenticated lookup.
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User" ("deletedAt");
