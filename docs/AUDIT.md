# Talent4u — Audit (BUILD_PLAN v2, Session R.1)

> **Date:** 2026-09-12 · **Commit:** `0cc3e93` + uncommitted work from this session · **Scope:** report only, no code changed by this audit.
>
> Ranked as R.1 requires: **security > broken business rule > missing feature > code quality.**
>
> Companion documents: `docs/ai/PROJECT_CONTEXT.md` is the long-form architecture reference and carries the detail behind most findings here. This file is the v2 gap map.

---

## 0. The one finding that matters

### 🔴 CRITICAL — the entire database is readable and writable with the public anon key

**Status: live right now, in the database this repo is pointed at.**

R.1 item 3 asks whether Supabase tables are reachable with the public anon key. They are — completely.

Measured, not inferred:

| Check | Result |
|---|---|
| Tables in `public` | 20 |
| Tables with RLS enabled | **0** |
| RLS policies defined | **0** |
| `anon` privileges | **SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER — on all 20 tables** |

And PostgREST serves them. Probed with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the key that ships inside every browser bundle:

```
GET /rest/v1/User?select=id,email,role       -> 200, returns rows
GET /rest/v1/Subscription?select=id,plan     -> 200, returns rows
GET /rest/v1/Application?select=recruiterNote-> 200, returns rows
```

**What this defeats.** Every server-side gate in this codebase — the ones the comments are proudest of — is bypassed by going around the application entirely:

- `User.email` and `User.role` are public. The CSV export was deliberately built *without* emails to keep hiring on-platform; the anon key serves every email directly.
- `Application.recruiterNote` is the Growth-tier private-notes feature. Public.
- `Message.body` — private conversations. Public.
- `Subscription.plan` is **UPDATE-able**: a user can grant themselves `RECRUITER_TEAM`.
- `RecruiterProfile.tier` is UPDATE-able: self-assign `TRUSTED`, the gold trust badge.
- `User.role` is UPDATE-able: self-assign `ADMIN`.
- `FreelancerProfile.searchBoost` is UPDATE-able: free users outrank Pro.
- `TRUNCATE` is granted on every table.

The application quota, the active-post cap, the candidate-search paid wall, the mutual-review lock enforced by four database constraints — all of it is enforcement on the front door of a building with no back wall.

**Why the fix is safe.** Prisma connects as `postgres`, which **owns the tables and has `rolbypassrls = true`**. Enabling RLS therefore closes the anon/authenticated path and changes nothing about how the application reads and writes. There is no policy-writing exercise here: the correct policy set is *none*, because no legitimate access goes through PostgREST.

**Proposed fix** — a migration, not yet applied, awaiting approval:

```sql
-- Deny-all by default. Prisma connects as the table owner with BYPASSRLS, so
-- the application is unaffected; PostgREST (anon + authenticated) gets nothing.
ALTER TABLE "User"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FreelancerProfile"       ENABLE ROW LEVEL SECURITY;
-- ... all 20 application tables ...

-- Belt and braces: PostgREST cannot use a privilege that was never granted.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
```

**Verification after applying:** re-run the three probes above and expect `401`/empty, then confirm the app still builds, the test suite passes, and `/jobs` still renders.

**Caveat worth stating:** Supabase Auth needs its own `auth` schema, which this does not touch. If any future feature is meant to use the Supabase client directly from the browser for data (none does today — `lib/auth/supabase.ts` is used for auth only, and `lib/storage/*` uses the secret key server-side), it will need explicit policies at that point.

This is P0 in v2's own Appendix C ("Supabase RLS lockdown"), which is a point in favour of adopting v2.

---

## 1. Every v2 session: done / partial / missing / diverged

"Done" means the acceptance criteria are met, not that a file with the right name exists.

### Phase R — Recovery
| Session | Status | Evidence |
|---|---|---|
| R.1 Audit | **This document** | Also `docs/ai/PROJECT_CONTEXT.md` |
| R.2 Test harness | **missing** | No CI, no integration tier, no Playwright — see 0.3 |
| R.3 Invariant tests | **missing** | No `tests/invariants/`, no `tests/authz/matrix.test.ts` |

### Phase 0 — Foundation
| Session | Status | Evidence |
|---|---|---|
| 0.1 Schema review | **partial** | Schema is strong and indexed for the real query patterns (`docs/ai/PROJECT_CONTEXT.md` §6). **Diverged from v2's list:** no Company entity with memberships, no `PAUSED`/`FILLED`/`EXPIRED` job statuses, no `expiresAt`, money is plain `Int` USD with no currency code, no `firstResponseAt`/`withdrawnAt`, no `AuditLog`, no `StripeEvent` table, no `Notification`, no `SavedSearch`, no `ScreeningQuestion`, no portfolio items, no availability status beyond `isOpenToWork`, no slug history, no terms-acceptance record |
| 0.2 Migration, seed | **partial** | 12 migrations, rich idempotent seed (138 freelancers, 15 jobs, all statuses). **Missing:** `tests/factories/` — tests use local builder closures; `scripts/seed-scale.ts` does not exist |
| 0.3 Test harness + CI | **missing** | **No CI at all** (no `.github/`). No `npm run check`, `test:unit`, `test:int`, `test:e2e`. No Playwright, axe, or local-Supabase integration tier. 53 test files, all unit, all mocking Prisma at the module boundary |
| 0.4 Auth | **partial / diverged** | Supabase Auth, server-side guards, proxy; admin is DB-only and not self-assignable *through the app*. **But** see §0: `User.role` is writable with the anon key, so "cannot self-assign ADMIN" is currently false at the database. Rate limiting exists (fixed-window in Postgres, 14 of 17 action files + the export route). **No bot protection.** **No RLS** |
| 0.5 Entitlements, clock, errors | **partial / diverged** | Entitlements exist and are excellent — `lib/pricing/` with `gate-audit.test.ts` pinning the whole plan × tier × role matrix. **`lib/clock` does not exist**; `new Date()` is called directly in business logic (see §4). **`lib/errors` does not exist** — services return discriminated result unions instead, which **conflicts with v2's rule**; see §6 |

### Phase 1 — Profiles
| Session | Status | Evidence |
|---|---|---|
| 1.1 Freelancer onboarding | **done** | `lib/services/freelancer.ts`, `app/(auth)/onboarding/freelancer/`. Availability is `isOpenToWork` only, not v2's richer status |
| 1.2 Portfolio | **missing** | Profile links only (GitHub/portfolio/LinkedIn). No portfolio items |
| 1.3 Companies + recruiter onboarding | **partial / diverged** | `RecruiterProfile` is 1:1 with `User`. **No Company entity, no memberships, no seats** — the TEAM plan advertises 5 seats with no seat model. This is the multi-seat work already queued |
| 1.4 Public profiles | **done** | `/freelancers/[slug]`, `/companies/[slug]`, JSON-LD, sitemap |
| 1.5 Settings, deletion, legal | **done** | Account deletion anonymises and cancels Stripe; terms/privacy/contact exist. **No terms-acceptance version/timestamp** |

### Phase 2 — Jobs
| Session | Status | Evidence |
|---|---|---|
| 2.1 Job posting | **partial** | Draft/publish, cap enforced in-transaction under `FOR UPDATE`. **Missing:** expiry, pause, filled, screening questions |
| 2.2 Safety scanner + reporting | **done, extended this session** | Scanner on job publish (holds), messages (flags after), and now profile prose (refuses) — `lib/services/profile-safety.ts`. Reports and moderation queue exist |
| 2.3 Browse | **done** | Keyset pagination, forgiving filters, early-access query filter |
| 2.4 Job detail | **done** | Visibility decision, JSON-LD, OG image (fixed this session) |
| 2.5 Launch minimum | **missing** | **No background job runner**, no staging environment, no bot protection |

### Phase 3 — Applications
| Session | Status | Evidence |
|---|---|---|
| 3.1 Quota | **done** | 12/30 days, in-transaction under a row lock. **No concurrency test** |
| 3.2 Apply flow | **partial** | Apply works. **`WITHDRAWN` has no writer** — freelancers cannot withdraw |
| 3.3 Recruiter inbox | **done** | Status transitions, notes gated Growth+ |
| 3.4 Application messaging | **done** | Two-way threads exist. **No blocking** |
| 3.5 Notifications + email | **partial** | 11 transactional types via Resend. **Only the digest has unsubscribe; no `List-Unsubscribe` header** |

### Phase 4 — Trust
| Session | Status | Evidence |
|---|---|---|
| 4.1 Verification | **partial** | Recruiter tiers work end to end. **Freelancer ID verification is unreachable** — no vendor, and no db function can write `verification` |
| 4.2 Engagements + reviews | **done** | Mutual confirmation enforced at four layers. Anti-gaming partial: TRUSTED counts distinct freelancers, but collusion between two accounts is possible by design |
| 4.3 Moderation console | **partial** | Queue, clear/uphold, ban, `/removed-employers`. **No AuditLog** |

### Phase 5 — Billing
| Session | Status | Evidence |
|---|---|---|
| 5.1 Stripe subscriptions | **done** | Checkout, portal, signed webhooks. Idempotency via a watermark column + unique constraints rather than v2's `StripeEvent` table — **diverged, but sound** |
| 5.2 Plan lifecycle | **partial** | Grace period exists (14 days). `searchBoost` now follows the subscription (this session). **Downgrade does not reclaim job slots** |
| 5.3 Regional pricing | **done** | Bands resolved from billing country; no USD amounts outside `lib/pricing/prices.ts` |

### Phase 6 — Search and outreach
| Session | Status | Evidence |
|---|---|---|
| 6.1 Candidate search | **done** | tsvector + GIN, keyset cursor, Growth wall before any query. `searchBoost` ranking now actually works |
| 6.2 Outbound messaging | **partial** | Outreach gated by plan *and* tier. **No daily cap beyond the rate limiter, no freelancer opt-out** |

### Phase 7 — Retention and metrics
| Session | Status | Evidence |
|---|---|---|
| 7.1 Saved jobs, alerts, digest | **partial** | Saved jobs and the weekly digest ship. **No search alerts / SavedSearch** |
| 7.2 Metrics | **done** | All three north-star ratios as raw SQL, admin-gated. No product-analytics funnels |
| 7.3 User-facing insights | **done this session** | `lib/services/application-analytics.ts`, Pro-gated |

### Phase 8 — Pre-launch QA
| Session | Status |
|---|---|
| 8.1–8.5 | **missing** — no security review, load testing, a11y/SEO audit, regression suite, or ops readiness |

---

## 2. Business rules: where enforced, and what tests them

Full detail in `docs/ai/PROJECT_CONTEXT.md` §11. Summary against R.1's question — service layer or only UI?

| Rule | Enforced | Layer | Test |
|---|---|---|---|
| Browsing free, incl. logged out | `lib/pricing/entitlements.ts:46` literal `true` | config | `gate-audit.test.ts` |
| 12 applications / 30 days | `lib/db/application.ts:86-91`, in `$transaction` under `FOR UPDATE` | **db, correct** | Service test only — **the transaction itself is never executed in any test** |
| Early access 6h | `lib/db/job-browse.ts:44`, `lib/jobs/jsonld.ts:118`, `lib/db/application.ts:74`, `lib/db/directory.ts:60`, `lib/services/digest.ts:65`, and the OG route (fixed this session) | db × 6 | `job-browse.test.ts`, `jsonld.test.ts` |
| Active post cap 1/5/∞ | `lib/db/job.ts:189-194`, in-transaction | **db, correct** | Service test; transaction untested |
| Candidate search paid wall | `lib/services/candidate-search.ts:69`, before any query | **service, correct** | `candidate-search.test.ts` |
| Export = Team | `lib/services/candidate-export.ts` | service | `candidate-export.test.ts` |
| Notes = Growth+ | `lib/services/application.ts:274` | service | `application.test.ts` |
| Initiate messages = tier | `lib/services/message.ts:186,260` | service | `message.test.ts` |
| Reviews need mutual confirmation | `lib/services/engagement.ts:433` **+ composite FK + 2 CHECKs + trigger** | service **and** db | `engagement-state.test.ts`; `prisma/verify-engagement.ts` attacks it directly |
| Safety: jobs held | `lib/db/job.ts:198`, in the publish transaction | db | `job.test.ts` (identity assertion only — the scanner is never run through the publish path) |
| Safety: messages | flagged **after** delivery — deliberate deviation | service | `message-safety.test.ts` |
| Safety: profile prose | refused on write, 4 call sites (this session) | service | `profile-safety.test.ts` + 3 service suites |
| Tier label on every job card | rendered unconditionally; digest fixed this session | UI | **No render test anywhere** |
| Regional pricing | `lib/pricing/prices.ts` sole source | config | `prices.test.ts` |

**All of the above are void while §0 stands.** Every row in this table describes the application layer; none of it constrains a PostgREST client.

---

## 3. Security findings (excluding §0)

1. **No server action or route handler lacks an auth check.** All 17 `actions.ts` call `requireUser`/`requireRole` before parsing, except `app/unsubscribe/actions.ts`, which is token-authorised by design. The four route handlers are: auth callback (public by design), cron (`CRON_SECRET`, `timingSafeEqual`, 503 when unset), Stripe webhook (signature-verified), and the new CSV export (`requireRole` + two entitlement gates).
2. **Role, plan and verification are never accepted from client input.** Everything reads `getEntitlementContext`/`getUserAuthState` from the account's own row. Verified by grep across `app/` and `lib/`.
3. **IDOR surface is small and mostly scoped.** Resource ids from forms are looked up scoped to the caller (`updateApplicationStatusForRecruiter`, `loadAsParty`, `getEditableJobForRecruiter`). One soft spot: `app/dashboard/saved/actions.ts:38` takes `jobId` from the form with no visibility check, and `lib/db/saved-job.ts:49-76` lists saved jobs with no cutoff and no status filter — mitigated only by ids being unguessable cuids. **No IDOR tests exist.**
4. **Rate limiting fails open by design** (`lib/services/rate-limit.ts:93`), documented and deliberate. Every authorization rule fails closed.
5. **No bot protection** on signup or apply.
6. **`prisma/verify-*.ts` (16 scripts) mutate whatever database they are pointed at**, one with a raw `$executeRaw UPDATE`. Nothing prevents production.
7. **Uploads validate MIME type and size only** — no magic-byte sniffing. Buckets are public-read.
8. Open accessibility defect: Base UI `nativeButton` misuse in `SiteHeader` and `LandingPage` floods the dev log.

---

## 4. Time in business logic (R.1 item 4)

**`lib/clock` does not exist.** ~30 direct `new Date()` calls sit in business logic, concentrated in `lib/db/`:

- `lib/db/application.ts:162,197,204` — `viewedAt`, `decidedAt`
- `lib/db/job.ts:208,239` — `publishedAt` (write-once), `closedAt`
- `lib/db/moderation.ts:165,203,221,232,257,266,271` — review and ban timestamps
- `lib/db/message.ts:155,210,247,381`, `lib/db/engagement.ts:335`, `lib/db/account-deletion.ts:52,74,96,105`, `lib/db/verification.ts:67`, `lib/db/freelancer-verification.ts:74`, `lib/db/users.ts:158`, `lib/db/rate-limit.ts:53,73`
- SQL `now()` in `lib/db/rate-limit.ts:35` (the fixed-window reset) and `lib/db/metrics.ts`

**Mitigating pattern already in place:** the *pure* layer takes `now` as a parameter with a default — `earlyAccessCutoffFor(plan, now)`, `entitledPlanFrom(sub, now)`, `isGraceExpired(sub, now)`, `windowStartFrom(now)`. That is why the time-sensitive rules are unit-testable today without a clock. v2's `lib/clock` would extend that discipline to the db layer, where it currently does not reach.

**Concrete cost of not having it:** `lib/services/billing.test.ts` had a fixture hardcoded to `2026-09-01` flowing into `getBillingView`, which reads `Date.now()` directly. The suite went red on its own on that date with no code change. Fixed this session by making the fixture relative — a clock would have made it impossible.

---

## 5. What the existing tests actually assert

53 files, 915 cases, all green. Honest summary:

- **The style is module-boundary mocking.** `vi.mock("@/lib/db/<domain>")`, so Prisma never loads. Excellent for pure rules; it means **no test touches SQL**.
- **The load-bearing transactions are never executed.** `applyToJobTx` and `publishJobTx` are always `vi.fn()`. Nothing proves the `FOR UPDATE` lock stops a 13th concurrent application or a 6th concurrent publish. These are the two most important pieces of code in the product.
- **Tests that mock the thing they claim to test:** `job.test.ts:176` asserts `args.scan === scanTextForSafetyFlags` — identity, not behaviour; the scanner never runs through the publish path. `job-browse.test.ts:36,90` assert absence with `JSON.stringify(where).not.toContain("publishedAt")`, which silently passes if the key is renamed.
- **No component, route-handler or Server Action tests.** The HTTP and auth boundary is untested; only the services beneath it.
- **Real integration coverage exists but is unautomated:** 16 `prisma/verify-*.ts` scripts run against a real seeded database and are not wired into npm or CI.
- **🟠 The suite was not hermetic, and was green for the wrong reason.** `lib/services/report.test.ts` is the only test that imports a Server Action (`@/app/report/actions`). That action calls `checkRateLimit` before parsing, and the file mocked the db, the guards and `next/navigation` — **but not the rate limiter**. So every run wrote a `report:` row to the real database and incremented it. It passed all day only because the database was unreachable and the limiter **fails open**; once the database came back, the counter climbed past the 20/hour limit and five tests went red on the 21st run within the hour, with no code change.

  Two things worth taking from it: a test suite whose result depends on how many times you ran it in the last hour is not a suite, and *fail-open* infrastructure hides its own absence in tests. **Fixed this session** by mocking `@/lib/services/rate-limit` in that file — not to skip the rule, which has its own suite in `rate-limit.test.ts`, but because that file's subject is the action's auth, validation and redirect routing. Verified: three consecutive runs, database counter unchanged.

  **This is the strongest single argument for v2's integration tier.** Real IO in a suite that believes it is mocked is exactly what an explicit, separate integration layer prevents.
- **Nothing is skipped.** No `.skip`, `.todo`, `.only` anywhere.
- **Structural test added this session:** `tests/loading-boundaries.test.ts` pins the soft-404 fix, because a `loading.tsx` in the wrong place breaks HTTP status on pages that look fine in a browser.

---

## 6. Where v2 conflicts with what is built

Flagged rather than silently obeyed, because in each case the existing code has a documented reason.

1. **`lib/errors` vs result unions.** v2: *"Throw typed errors from lib/errors. Never return ad-hoc error strings."* The codebase returns `{ ok: true, … } | { ok: false, reason: "kebab-case" }` from ~26 services, and the reasons are **typed literal unions, not ad-hoc strings** — the compiler forces every caller to handle every case, which a thrown error does not. Converting would be a large refactor of every service and action, and arguably a downgrade in type safety. **Recommend: keep result unions, and read v2's rule as banning untyped error strings — which the codebase already does.**
2. **`visibleJobsWhere()` as the single home of job visibility.** Today it is two functions: `buildJobBrowseWhere` (list) and `decideJobVisibility` (detail). They agree, and both are tested — but the OG image leak fixed this session was precisely a caller that used neither. **v2 is right here; worth consolidating.**
3. **`npm run check` and the test script names** in Appendix B do not exist (`test:unit`, `test:int`, `test:e2e`). The proposed Stop hook runs `npm run test:unit`, which would fail immediately.
4. **Money as integer minor units + currency code.** Today rates and budgets are whole USD `Int`, and `lib/pricing` is already integer cents with a single currency. A change here touches the schema and every display path.
5. **Seed vs factories.** v2: *"Tests use factories, never seed data."* Unit tests already use local builders and never read the seed — the gap is that there is no shared `tests/factories/`, and no integration tier that would need one.

---

## 7. Recommended order

1. **§0 RLS lockdown.** Nothing else on this list matters until it is done.
2. **0.3 Test harness + CI** — v2 is right that this is the gap that lets everything else drift. Without CI the "definition of done" has no teeth.
3. **R.3 invariant + authz matrix tests**, especially real-Postgres tests for the two transactions.
4. **1.3 Company + seats** — the TEAM plan is sold and does not exist.
5. Then the P0 gaps from Appendix C in the order v2 gives them.
