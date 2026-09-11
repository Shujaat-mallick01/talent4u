# PROGRESS

The only memory between sessions. If it isn't written here, the next session doesn't know it happened.

Newest first. One entry per slice: what was built, what was verified, what is knowingly left undone.

---

## 2026-09-12 — Adopted BUILD_PLAN v2; Session R.1 audit

**Built:** `docs/AUDIT.md` (the R.1 deliverable), `docs/BUILD_PLAN.md` (moved from the repo root), this file, `docs/DECISIONS.md`.

**🔴 The finding:** every table in `public` is readable *and writable* with the publishable anon key that ships in every browser bundle. 20 tables, 0 with RLS, 0 policies, and `anon` holds SELECT/INSERT/UPDATE/DELETE/TRUNCATE on all of them. Verified by probing PostgREST: `User.email`, `User.role`, `Subscription.plan` and `Application.recruiterNote` all return 200. Every server-side gate in the product is bypassable by going around the application.

**Not fixed — awaiting approval.** The migration is a deny-all RLS enable plus a REVOKE; it is safe because Prisma connects as `postgres` with `rolbypassrls = true`, so the application is unaffected. SQL is in `docs/AUDIT.md` §0.

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
