-- ── Portfolio items ──────────────────────────────────────────────────────
--
-- A freelancer profile was a directory row: name, headline, rate, skills. That
-- is a filter result, not a reason to hire anyone. This is the unit that turns
-- it into a case — an image, a title, and what the work was.
--
-- Adds nothing to the trust model and takes nothing from it: portfolio prose
-- goes through the same scanner as every other public field
-- (lib/services/profile-safety.ts), and the images live in a public bucket
-- exactly like avatars do.
--
-- RLS is enabled in this migration, not a later one. Supabase grants anon and
-- authenticated full DML on everything in `public` by default and serves it
-- over PostgREST, so a table created without RLS is world-writable from the
-- moment it exists — see 20260912090000_rls_lockdown for what that cost.
-- The default privileges revoked there cover new tables, but the table's own
-- RLS is per-table and has to be switched on here.

CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- The only read there is: one freelancer's items, in their chosen order.
CREATE INDEX "PortfolioItem_freelancerId_position_idx" ON "PortfolioItem"("freelancerId", "position");

-- Cascade: a portfolio item is pure content belonging to one profile. Unlike
-- applications or reviews it is nobody else's record, so deleting the profile
-- takes it with it rather than leaving an orphan.
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_freelancerId_fkey"
  FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all, same as every other table. Prisma connects as the owner with
-- BYPASSRLS; nothing reaches this table through PostgREST.
ALTER TABLE "PortfolioItem" ENABLE ROW LEVEL SECURITY;

-- Constraints Prisma cannot express.
ALTER TABLE "PortfolioItem"
  -- A card with no image is the thing this feature exists to fix.
  ADD CONSTRAINT "portfolio_title_not_blank" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "portfolio_image_not_blank" CHECK (btrim("imageUrl") <> ''),
  -- Ordering is a non-negative rank, never a sentinel.
  ADD CONSTRAINT "portfolio_position_non_negative" CHECK ("position" >= 0);
