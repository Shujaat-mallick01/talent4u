-- ── RLS lockdown ─────────────────────────────────────────────────────────
--
-- Closes the hole documented in docs/AUDIT.md §0: every table in `public` was
-- readable AND writable with the publishable anon key, which ships inside every
-- browser bundle. Measured before this migration: 20 tables, 0 with RLS, 0
-- policies, and `anon` holding SELECT/INSERT/UPDATE/DELETE/TRUNCATE on all of
-- them. PostgREST served them: User.email, User.role, Subscription.plan and
-- Application.recruiterNote all returned 200 to an anonymous caller.
--
-- Every server-side gate in this product — the application quota under its row
-- lock, the candidate-search paid wall, the four database constraints behind the
-- mutual-review rule — was a front door on a building with no back wall.
--
-- WHY DENY-ALL IS THE WHOLE POLICY SET, and why this is safe:
--
--   Nothing in this codebase reaches the database through PostgREST. The
--   application connects through Prisma as `postgres`, which OWNS these tables
--   and has rolbypassrls = true, so RLS does not apply to it. The browser's
--   Supabase client is used for AUTH ONLY (lib/auth/supabase.ts); file uploads
--   go through the secret key server-side (lib/storage/supabase-admin.ts).
--
--   So the correct number of policies is zero. Enabling RLS with no policy
--   denies anon and authenticated everything, and the application does not
--   notice. That is the entire fix.
--
--   If a future feature genuinely needs to read data from the browser via
--   supabase-js, THAT is when a policy gets written — one table, one policy,
--   deliberately. Not before.
--
-- The REVOKEs are belt and braces: a privilege that was never granted cannot be
-- used even if someone later disables RLS on one table by hand.
--
-- Prisma does not model RLS, so `prisma migrate dev` will never propose undoing
-- this and there are no generated DROPs to hand-delete here — unlike the
-- CHECK/trigger migrations, whose headers warn about exactly that.

ALTER TABLE "Application"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Engagement"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FreelancerProfile"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimit"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecruiterProfile"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafetyFlag"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedJob"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skill"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SkillOnFreelancer"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SkillOnJob"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations"      ENABLE ROW LEVEL SECURITY;

-- Take the grants away as well. Supabase grants these to anon/authenticated by
-- default on everything in `public`, including tables created later.
--
-- Guarded on the roles existing, because `anon` and `authenticated` are
-- Supabase's, not Postgres's. CI and any local Postgres — including the shadow
-- database prisma.config.ts tells you to point `migrate dev` at — have neither,
-- and an unguarded REVOKE fails the whole migration there with "role does not
-- exist". The RLS above is what actually protects the data; these REVOKEs are
-- belt and braces, so skipping them where the roles are absent loses nothing.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      -- And for every object this project creates from here on.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
