# PROGRESS

The only memory between sessions. If it isn't written here, the next session doesn't know it happened.

Newest first. One entry per slice: what was built, what was verified, what is knowingly left undone.

---

## 2026-09-12 — CI and the integration tier (v2 session 0.3, partial)

**Built:** `.github/workflows/ci.yml` — the first CI this repo has ever had. Generate → migrate → typecheck → lint → unit → integration → build, against a Postgres service, on every push and PR. Vitest split into two projects (`unit`, `integration`). `tests/factories/` and `tests/integration/setup.ts`, whose guard **refuses to run unless DATABASE_URL names a test database** — these tests TRUNCATE, and `.env` points at production.

**The test that mattered:** `tests/integration/application-quota.test.ts`, 7 cases against real Postgres. `applyToJobTx` was `vi.fn()` in every existing test, so nothing proved the row lock stopped a 13th concurrent application. **Verified by removing the `FOR UPDATE`: 3 of 5 concurrent applies got through instead of 1** — a freelancer would have ended at 14 against a limit of 12. With the lock, exactly 1.

**Also fixed:** the RLS migration referenced the Supabase roles `anon` and `authenticated` unguarded, so it would have failed on any vanilla Postgres — CI, or the shadow database `prisma.config.ts` tells you to create. Now guarded on the roles existing, and proven by applying all 13 migrations to a clean postgres:16 container.

**Verified:** the whole CI sequence run locally in order against that container — 915 unit, 7 integration, build exit 0.

**Still owed from 0.3, needs new dependencies:** Playwright + @axe-core/playwright for E2E, and @vitest/coverage-v8 for the 85% threshold on lib/services, lib/pricing, lib/auth. Not installed — CLAUDE.md and v2's own session protocol both say ask first.

---

## 2026-09-12 — RLS lockdown applied ✅

**Built:** migration `20260912090000_rls_lockdown` — RLS enabled on all 20 tables, all grants revoked from `anon` and `authenticated`, and default privileges revoked so future tables inherit the lockdown.

**Verified:** every probe that previously returned data now returns 401, including a privilege-escalation `PATCH` setting `User.role = ADMIN` (SQLSTATE 42501). 0 tables without RLS, 0 grants. Application unaffected: 915 tests, build exit 0, every public page 200 against the live database. Auth healthy.

**Knowingly unverified:** a full signed-in session — no working password for any seeded account. Sign in once and click through the dashboard.

**Next, per `docs/AUDIT.md` §7:** CI (v2 session 0.3), then invariant + authz-matrix tests against real Postgres, then Company/seats.

---

## 2026-09-12 — Adopted BUILD_PLAN v2; Session R.1 audit

**Built:** `docs/AUDIT.md` (the R.1 deliverable), `docs/BUILD_PLAN.md` (moved from the repo root), this file, `docs/DECISIONS.md`.

**🔴 The finding:** every table in `public` is readable *and writable* with the publishable anon key that ships in every browser bundle. 20 tables, 0 with RLS, 0 policies, and `anon` holds SELECT/INSERT/UPDATE/DELETE/TRUNCATE on all of them. Verified by probing PostgREST: `User.email`, `User.role`, `Subscription.plan` and `Application.recruiterNote` all return 200. Every server-side gate in the product is bypassable by going around the application.

**Fixed in the slice above**, same day. The migration is a deny-all RLS enable plus a REVOKE; it was safe because Prisma connects as `postgres` with `rolbypassrls = true`.

**Known gaps after this slice:** everything in `docs/AUDIT.md` §1 marked missing or partial. Top of the list after RLS: CI (none exists), integration tests against real Postgres, and the Company/seats model that the TEAM plan is already sold against.

---

## 2026-09-11/12 — Correctness pass and two paid features (pre-v2)

Work done before v2 was adopted, recorded here so the audit has a trail.

**Fixed**
- **Job OG image leaked hidden jobs.** `app/jobs/[slug]/opengraph-image.tsx` called `getPublicJobBySlug` and rendered whatever came back, with no visibility check — so `/jobs/<slug>/opengraph-image` returned title, company, tier, budget and location for DRAFT, PENDING_REVIEW (scanner-held), REMOVED, banned-recruiter and in-window jobs whose page 404s. Now gates on `decideJobVisibility` with the anonymous cutoff. Verified against the live database: held, draft and missing slugs return a byte-identical fallback card; a live job renders its own.
- **The whole public SEO surface soft-404'd.** `/jobs/<slug>`, `/freelancers/<slug>` and `/companies/<slug>` returned **HTTP 200** with not-found content. Cause proven by experiment: a `loading.tsx` opens a Suspense boundary, the shell streams, 200 is committed, and `notFound()` can no longer change it. Calling `notFound()` from `generateMetadata` does **not** fix it — tried and measured. Fixed by scoping the boundaries with route groups (`app/jobs/(index)/`, `(marketing)`, `(auth)`), keeping every skeleton. Pinned by `tests/loading-boundaries.test.ts`.
- **Profile prose bypassed the safety scanner** — four write paths, not one: company description and freelancer bio, on both the edit and the onboarding path. Now refused on write via `lib/services/profile-safety.ts`.
- **The weekly digest stripped the tier label** off job cards. Now carried through to HTML and plain text via the shared `recruiterTierBadge`.
- **A fixture date turned the suite red on its own** on 2026-09-01. Made relative.
- **Eleven actions had no rate limit.** Added, plus a new `application-write` bucket.

**Built**
- `searchBoost` now follows the subscription (it had *no writer*; Pro's "search boost" was sold and never delivered).
- Team-tier candidate CSV export — public profile fields only, no emails, formula-injection defused, capped at 500 rows.
- Pro freelancer application analytics.
- BRANDGUIDE volume three: two registers (expressive marketing / calm product), CSS-only motion, no new dependency.

**Verified:** typecheck, lint, 915 tests, and `next build` all green. Build and dev server confirmed working against the live database.

**Knowingly undone:** multi-seat (needs a schema plan first); `WITHDRAWN` still has no writer; `lib/db/saved-job.ts` lists saved jobs with no cutoff or status filter; freelancer ID verification is unreachable; the jobs 404 shows the site default `<title>`.
