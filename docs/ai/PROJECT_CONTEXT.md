# Talent4u — Project Context

> **Written:** 2026-09-11 · **Last updated:** 2026-09-11 (post-fix pass) · **Commit:** `0cc3e93547b5dd5a5b90668069a198327f40ca77` ("feat: implement self-service account deletion functionality") · **Branch:** `master`, clean working tree.
>
> This is the long-form reference. `CLAUDE.md` holds the short rules loaded into every session; read this file when you need architecture detail, a traced flow, or the health/risk picture.
>
> Every claim below was verified by opening the cited file or running the cited command. Statements marked *(inferred)* rest on naming or partial evidence. If a fact here contradicts the code, the code wins — and this file is stale.

---

## 1. What the product is

A **commission-free hiring marketplace**. Recruiters post jobs, freelancers apply, the two parties contract directly. Talent4u takes 0% of anyone's earnings and never touches the money: no escrow, no payouts, no Stripe Connect. Revenue is subscriptions only.

Because the platform holds no payment data, it cannot verify that work happened. The entire trust model is a substitute for that missing signal: recruiter verification tiers, freelancer work-link review, an automated scam-text scanner, mutually-confirmed engagements as the precondition for reviews, and a public `/removed-employers` page.

**Four user types**, all keyed off `User.role` (`prisma/schema.prisma:31`):

| Role | What they do | Paid tiers |
|---|---|---|
| Logged-out visitor | Browse `/jobs`, `/freelancers`, `/companies/[slug]` — full SEO surface, never gated | — |
| `FREELANCER` | Apply (12 per rolling 30 days on free), save jobs, message, confirm engagements, review | `FREELANCER_PRO` |
| `RECRUITER` | Post jobs (1 / 5 / unlimited), receive applications, candidate search, outreach | `RECRUITER_GROWTH`, `RECRUITER_TEAM` |
| `ADMIN` | Moderation queue, verification approvals, `/admin/metrics` | Granted by hand in the DB only |

Feature areas, each shipped as a vertical slice: auth + onboarding, profiles, job posting/browse/detail, applications, messaging, engagements + reviews, verification, safety scanning + moderation, Stripe subscriptions, candidate search, transactional email + weekly digest, account deletion.

---

## 2. Stack and versions

Read from `package.json` and `node_modules/*/package.json` on 2026-09-11 — not from memory. Several differ from what `CLAUDE.md` currently claims (see §12).

| Thing | Version | Notes |
|---|---|---|
| Next.js | **16.3.1** | App Router. CLAUDE.md says "Next.js 15" — wrong. Middleware is renamed `proxy.ts`. |
| React / React DOM | 19.2.8 | |
| TypeScript | 5.9.3 | `strict: true`, `target: ES2017`, `moduleResolution: "bundler"`, alias `@/* → ./*` |
| Prisma / @prisma/client | **7.9.1** | v7 requires an explicit driver adapter; there is no `datasource.directUrl` |
| @prisma/adapter-pg + pg | 7.9.1 / 8.23 | The runtime adapter |
| Zod | 4.4.3 | v4 idioms (`z.email()`, `.issues`) |
| Tailwind CSS | **4.3.3** | CSS-first. **No `tailwind.config`** — config lives in `app/globals.css` |
| shadcn | 4.18.0, style `base-maia` | `components.json`; primitives are **Base UI** (`@base-ui/react` 1.7.0), *not* Radix — use `render={}`, never `asChild` |
| Stripe | 22.5.0, API pinned `2026-07-29.dahlia` | `lib/billing/stripe.ts:44` |
| @supabase/ssr / supabase-js | 0.12.4 / 2.112.3 | Auth + Storage |
| Vitest | 4.1.11 | `environment: "node"` |
| ESLint | 9.39.5 + `eslint-config-next` 16.3.1 | Flat config, `eslint.config.mjs` |
| Package manager | **npm** | `package-lock.json`, lockfileVersion 3 |

**Not installed, despite being named in the docs:** `resend`, `react-email`/`@react-email/*`, `@sentry/*`, any ID-verification vendor (Persona/Onfido/Veriff/Jumio), any e2e framework (Playwright/Cypress/Puppeteer/testing-library/jsdom/msw).

**Installed but unused:** `@hugeicons/react` and `@hugeicons/core-free-icons` have **zero imports** — every glyph is hand-drawn inline SVG in `components/ui/icon.tsx`. `components.json:13` still declares `"iconLibrary": "hugeicons"`.

### Node runtime

**Nothing is pinned** — no `.nvmrc`, no `.tool-versions`, no `.node-version`, no `engines` field. The floor comes from dependencies:

- `node_modules/next/package.json` → `>=20.9.0`
- `node_modules/prisma/package.json` → `^20.19 || ^22.12 || >=24.0` (stricter, so this governs)

**Effective requirement: Node ≥20.19, or ≥22.12, or ≥24.** Verified working locally on **Node v22.18.0 / npm 10.9.3**.

### Infrastructure

- **PostgreSQL on Supabase.** Two connection strings with no overlap (`prisma.config.ts:14-34`): `DATABASE_URL` is the *pooled* pgBouncer connection on port 6543, used by the app at runtime through the driver adapter; `DIRECT_URL` is the *direct* session connection on port 5432, used by the Prisma CLI only. Migrations must not run through the pooler — DDL and the migration advisory lock both fail against a transaction pooler.
- **Supabase Auth** (email/password + Google OAuth) and **Supabase Storage** (two public-read buckets: `company-logos`, `avatars`).
- **Stripe** — subscriptions only. No Connect, no payouts, no marketplace payments anywhere in the repo.
- **Resend** — reached by raw `fetch` to `https://api.resend.com/emails`, no SDK.
- **Vercel** — `vercel.json` declares one cron: `/api/cron/job-digest`, `0 9 * * 2` (Tuesdays 09:00 UTC).
- **No queue, no Redis, no cache layer, no microservice.** CLAUDE.md forbids them and the code complies. The only caching is React `cache()` (per-request dedup) and two `unstable_cache` calls.
- **No CI.** There is no `.github/` directory, no workflows, no git hooks, no Husky. `lint`/`typecheck`/`test` are enforced by convention only.

### Environment variables

Names only — read `.env.example`, never `.env`.

| Name | Read at | Controls |
|---|---|---|
| `DATABASE_URL` | `lib/db/client.ts:10` | Pooled runtime connection. **Throws at module import if unset.** |
| `DIRECT_URL` | `prisma.config.ts:26` | Prisma CLI (migrate/studio/seed) |
| `SHADOW_DATABASE_URL` | `prisma.config.ts:41` | Only needed for `prisma migrate dev`. **Missing from `.env.example`** |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/auth/supabase.ts:4` | **Throws at import if unset** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `lib/auth/supabase.ts:5` | **Throws at import if unset** |
| `SUPABASE_SECRET_KEY` | `lib/storage/supabase-admin.ts:20` | Storage admin + `auth.admin.deleteUser`. Server only. Lazy. |
| `NEXT_PUBLIC_SITE_URL` | `lib/site-url.ts:10` | Canonicals, JSON-LD, OAuth callback, every link in every email. **Throws if unset when `NODE_ENV=production`**; falls back to `http://localhost:3000` otherwise |
| `STRIPE_SECRET_KEY` | `lib/billing/stripe.ts:24` | Billing on/off. Lazy — unset just disables billing |
| `STRIPE_WEBHOOK_SECRET` | `lib/billing/stripe.ts:28` | Signature verification. Unset ⇒ webhook returns 503, never 200 |
| `STRIPE_PRODUCT_FREELANCER_PRO` / `_RECRUITER_GROWTH` / `_RECRUITER_TEAM` | `lib/billing/stripe.ts:90-92` | Product↔plan mapping. **Load-bearing**: without them a portal plan-change charges the new price and keeps the old entitlements, permanently, with no later event to correct it |
| `RESEND_API_KEY` | `lib/email/client.ts:41` | Unset ⇒ dev logs to console, prod reports failure |
| `EMAIL_FROM` | `lib/email/client.ts:37` | Has a fallback |
| `CRON_SECRET` | `app/api/cron/job-digest/route.ts:33` | Digest auth. Unset ⇒ 503, refuses every request |
| `DEV_SEED_PASSWORD` | `prisma/dev-auth-users.ts` | Password set on every seeded account |
| `NODE_ENV` | several | Query logging, global Prisma reuse, prod strictness, `/dev` 404 |

Three reads **throw at module scope** and will break a build if unset: `DATABASE_URL` and both `NEXT_PUBLIC_SUPABASE_*`. Everything Stripe/Resend/Storage is deliberately lazy so an unconfigured deployment still renders public pages.

---

## 3. Repo map

Single Next.js app — not a monorepo. 562 tracked files; ~43,200 lines of TS/TSX across `app/`, `lib/`, `components/` (excluding the gitignored generated Prisma client, another ~40,000 lines).

```
app/                        100 files — routes; ~21 page.tsx read lib/db directly
  (marketing)/              landing, pricing, terms, privacy, contact, removed-employers
  (auth)/                   signin, signup, forgot/reset password, onboarding/{freelancer,recruiter}
  jobs/                     PUBLIC browse + detail (SEO critical) + OG image
  freelancers/              PUBLIC directory + profile (SEO critical)
  companies/[slug]/         PUBLIC company page (SEO critical)   <- absent from CLAUDE.md's layout
  dashboard/                recruiter/, freelancer/, messages/, engagements/, billing/,
                            saved/, settings/
  admin/                    moderation queue + metrics
  api/                      ONLY three route handlers: auth/callback, cron/job-digest, stripe/webhook
  report/                   actions.ts + notices.ts — NO page.tsx (a dialog on job/company pages)
  unsubscribe/              token-authorised; the one unauthenticated write in the product
  dev/states/               UI harness; 404s when NODE_ENV=production
lib/                        150 files
  db/                       29 — Prisma access ONLY
  services/                 55 — business logic (26 impl + colocated tests)
  validations/              24 — Zod schemas
  pricing/                  9  — plans, bands, prices, entitlements, catalogue (+ gate-audit test)
  auth/                     7  — guards, route-guard, session, supabase
  billing/                  stripe client + subscription state machine
  email/                    client (raw fetch) + hand-written HTML layout + 11 notifications
  storage/  observability/  geo/  brand/  jobs/  profile/  marketing/  config/  format/
  generated/prisma/         GITIGNORED build output — regenerate, never edit
components/                 41 — ui/ (15 primitives), shell/, plus feature components
prisma/                     schema + 12 migrations + seed (3 files) + 16 verify-*.ts scripts
tests/setup.ts              two lines: import "dotenv/config"
proxy.ts                    Next 16's renamed middleware
```

**Layering rule and its one exception.** `lib/db` is Prisma-only with no business logic; `lib/services` owns rules and returns typed result unions; `app/**/actions.ts` does auth + rate limit + FormData→object + redirect; Server Components read `lib/db` directly for reads. The single violation of "Prisma queries only in `lib/db/`" is **`lib/services/job-match.ts:3`**, which imports `{ prisma }` from `@/lib/db/client` and queries at `:38`.

---

## 4. Architecture and entry points

### How a request boots

`app/layout.tsx` renders **no chrome** — three `next/font/google` faces (Inter, Archivo, IBM Plex Mono), `globals.css`, a skip link, `{children}`. Chrome is chosen per route group:

- `(marketing)` and `(auth)` → `<PublicChrome>` = `SiteHeader` + `SiteFooter`
- `jobs/`, `freelancers/`, `companies/` → `<AdaptiveChrome>`: `await buildShellNav()`; a falsy nav (logged out, mid-onboarding, or admin) gives `PublicChrome`, otherwise `AppShell`. The *content* is identical either way, which is what keeps these routes SEO-safe.
- `dashboard/` → `await requireUser()`, then redirects to `/admin` or `/onboarding/{role}` if the nav is null
- `admin/` → `await requireRole("ADMIN")` + `getModerationCounts()` for the queue badge

### `proxy.ts` — convenience, not security

Next 16 renamed `middleware.ts` to `proxy.ts`. It runs on the Node runtime with `matcher: ["/dashboard/:path*", "/admin/:path*", "/onboarding/:path*"]` — public traffic never touches it. It refreshes the Supabase session via `supabase.auth.getUser()` (which validates the JWT against the Auth server rather than trusting the cookie), does one indexed `getUserAuthState` lookup, applies the pure `resolveProtectedRoute`, and copies refreshed cookies onto any redirect.

**It is explicitly non-load-bearing** (`lib/auth/route-guard.ts:8-11`): every protected layout, page and action re-runs `requireUser()`/`requireRole()` itself. A `curl` that skips the proxy hits identical checks. Treat the proxy as UX (fewer flashes of the wrong page), never as the gate.

### The three API route handlers

That is the complete list. There is no REST API — everything else is a Server Action.

1. **`app/api/auth/callback/route.ts`** — lands both PKCE `?code=` and email-OTP `?token_hash=&type=`; `type=recovery` short-circuits to `/reset-password`. Creates the app `User` row when a valid `?role=` is present, marks `emailVerified`, then redirects to `next ?? homeFor(...)`.
2. **`app/api/cron/job-digest/route.ts`** — `Authorization: Bearer <CRON_SECRET>` compared with `timingSafeEqual`; unset secret ⇒ **503, never open**. Nothing is read from the query string, so the secret never lands in an access log. Also piggybacks `pruneRateLimits()`.
3. **`app/api/stripe/webhook/route.ts`** — raw `request.text()` + `constructEventAsync`. **This is the only path in the product that can move an account onto a paid plan.** 400 on bad signature (never retried), 503 when unconfigured, 500 on a thrown error so Stripe retries.

### Authorization model

`lib/auth/` exports (`guards.ts`, `session.ts`, `route-guard.ts`):

| Export | Behaviour |
|---|---|
| `getSession()` | `{ userId, email } \| null`. Never throws. Built on `supabase.auth.getUser()`, **not** `getSession()`. React `cache()`-wrapped. |
| `requireUser()` | `redirect("/signin")` when logged out; `redirect("/onboarding")` when there is no app `User` row |
| `requireRole(role)` | `requireUser()` then `redirect(homeFor(...))` on mismatch. Role is read from the DB row, never the client |
| `getCurrentProfile()` | Non-throwing; `null` for logged-out / no account / onboarding incomplete / ADMIN |
| `homeFor(role, hasProfile)` | `ADMIN→/admin`, else `/dashboard/{role}` or `/onboarding/{role}` |
| `resolveProtectedRoute(path, state)` | Pure, no I/O — the proxy's decision function, and the reason it is unit-testable |

**`lib/auth/index.ts` is a dead barrel** — zero importers; every call site imports `@/lib/auth/guards` or `@/lib/auth/session` directly.

Admin is `User.role === "ADMIN"`, set by hand in the database; `selectableRoleSchema` deliberately omits it. Admin routes are guarded twice — at the layout/page/action, and again in the service (`lib/services/moderation.ts:23`, `recruiter-verification.ts:107`, `freelancer-verification.ts:207`, `metrics.ts:56`).

Session reads are memoised with React `cache()` per request (`getSession`, `getUserAuthState`, `getEntitlementContext`). **A Server Action that mutates then re-reads must use the uncached `getUserAuthStateFresh`** — see `app/(auth)/actions.ts:195` and `app/api/auth/callback/route.ts:83`.

### Signup → dashboard, file by file

1. `app/(auth)/signup/page.tsx:55` — posts to `signUpWithPassword`; optional `next` hidden input.
2. `app/(auth)/actions.ts:37` — Zod, `sanitizeNextPath`, per-IP rate limit, then `supabase.auth.signUp({ emailRedirectTo: ${SITE_URL}/api/auth/callback })`. Errors are deliberately generic (`signup_failed`) to avoid account enumeration. **No app `User` row is created here.**
3. `app/api/auth/callback/route.ts:36` — verifies the OTP or exchanges the PKCE code, then creates the `User` row if a valid `?role=` is present.
4. `app/(auth)/onboarding/page.tsx` — role choice (`chooseRole` → `createUserWithRole`).
5. `app/(auth)/onboarding/{freelancer,recruiter}/page.tsx` + `actions.ts` — profile creation, then `redirect("/dashboard/...")`.

**Role is captured at onboarding, not at registration.** `signUpSchema` is email + password only (`lib/validations/auth.ts:18-21`); commit `9bcfc5a` removed it from sign-up deliberately. `BUILD_PLAN.md` Phase 0.3 still describes the old behaviour.

Role is written exactly once by `createUserWithRole` — a `create`, never an upsert — and immutability is also enforced in the database by `User @@unique([id, role])` plus each profile's composite FK with `onUpdate: Restrict`.

**Dead OAuth role path:** `signInWithGoogle` reads `formData.get("role")` and the callback honours `?role=`, but no signin/signup form renders a role input. Every OAuth signup therefore lands on `/onboarding`.

---

## 5. Three traced flows

### Flow A — recruiter posts a job

| # | Hop | File |
|---|---|---|
| 1 | `NewJobPage` → `requireRole("RECRUITER")` + `getCurrentProfile()`, loads taxonomy | `app/dashboard/recruiter/jobs/new/page.tsx:9-17` |
| 2 | `<JobForm>` client component, `useActionState(submitJob, …)`; two submit buttons carry `name="intent" value="draft"\|"publish"` | `job-form.tsx:56,253,256` |
| 3 | Server Action `submitJob` — `requireRole("RECRUITER")` **then** `checkRateLimit("job-write", user.id)` | `app/dashboard/recruiter/jobs/actions.ts:65-76` |
| 4 | `jobPostSchema.safeParse`; issues flattened to `fieldErrors` keyed by `issue.path[0]` | `actions.ts:78-97`, `lib/validations/job.ts` |
| 5 | `createJobDraftForUser` / `updateJobDraftForUser` | `lib/services/job.ts:75,108` |
| 6 | `recruiterStanding()` (rejects `isBanned`), `resolveTaxonomy()` — client skill slugs are scrubbed against the `Skill` table | `lib/services/job.ts:55-73` |
| 7 | `createDraftJob` / `updateDraftJob` — `$transaction`, `status: "DRAFT"` | `lib/db/job.ts:34,74` |
| 8 | `publishJobForUser` → `getUserPlan` + `effectiveJobSlots(plan, tier)` → `publishJobTx` | `lib/services/job.ts:150-177` |
| 9 | `redirect(…?notice=published\|held_for_review)` or `failureRedirect(cap_reached&cap&used …)` | `actions.ts:54-63,133-137` |

**The cap and the scanner both live inside one transaction, under two row locks** (`lib/db/job.ts`):

```ts
await tx.$queryRaw`SELECT "id" FROM "RecruiterProfile" WHERE "id" = ${recruiterId} FOR UPDATE`;  // :165
// ... second FOR UPDATE on the Job row restricted to status IN ('DRAFT','CLOSED')   // :171-179
if (used >= cap) return { ok: false, reason: "cap-reached", used } as const;          // :193
const flag = scan(`${job.title}\n${job.description}\n${job.location ?? ""}`);         // :198
const status = flag ? ("PENDING_REVIEW" as const) : ("ACTIVE" as const);              // :199
```

`SLOT_STATUSES = ["ACTIVE", "PENDING_REVIEW"]` — a held post still holds a slot, so the review queue cannot be stuffed for free. On a flag the job gets `PENDING_REVIEW`, **`publishedAt` is not written**, and a `SafetyFlag{isAutomated:true, status:"OPEN"}` row is created.

`publishedAt` is **write-once** (`lib/db/job.ts:208`), which is what makes the early-access comparand immovable. `updateDraftJob` is scoped `where: { status: "DRAFT" }`, so published text is immutable — the edit-after-publish bypass is closed.

**Slug:** `slugify(title, "job")` (NFKD, diacritics stripped, 60-char cap) then `pickAvailableSlug` picking `base`, `base-2`, `base-3`…, retried up to 5 times on a P2002 whose conflict field is `slug`.

### Flow B — logged-out visitor browses and opens a job

`/jobs` → `JobsBrowsePage({ searchParams })` (`app/jobs/page.tsx:230`):

1. `parseJobBrowseParams` — a **forgiving whitelist parser**: invalid values are dropped, never 400. `q` capped at 80 chars, skills deduped and capped at 10, budgets clamped 0…1,000,000 with inverted ranges dropped.
2. `Promise.all([resolveEarlyAccessCutoff(), listCategories(), listSkillsForFilter(), getViewerSkillSlugs()])`, then `browseJobs(filters, cutoff)`.
3. `buildJobBrowseWhere` — pure and unit-tested. Base predicates `{status:"ACTIVE"}` and `{recruiter:{deactivatedAt:null}}`.
4. **Keyset pagination**, not offset: over `(publishedAt DESC, id DESC)`, page size 12, `take: 13` to compute `hasMore`. Cursor is `"<epoch-millis>~<id>"`, decoded defensively — tampered input yields page 1, never an error.
5. Applicant counts are a separate `groupBy` over the page's ids only (a relation `_count` would compile to an unfiltered whole-table aggregate).

**The early-access filter** (`lib/db/job-browse.ts:44-46`):

```ts
if (earlyAccessCutoff) {
  and.push({ publishedAt: { lte: earlyAccessCutoff } });
}
```

`EARLY_ACCESS_HOURS = 6` at `lib/pricing/plans.ts:14`. The cutoff producer:

```ts
export function earlyAccessCutoffFor(plan: PlanTier | null, now: Date): Date | null {
  if (plan === "FREELANCER_PRO") return null;
  return new Date(now.getTime() - EARLY_ACCESS_HOURS * 60 * 60 * 1000);
}
```

`resolveEarlyAccessCutoff()` is `cache()`-wrapped so the page and `generateMetadata` sample one boundary. **Logged-out gets the cutoff, not `null`.**

Detail `/jobs/[slug]` → `loadJobView(slug)` (`cache()`-wrapped) → `getPublicJobBySlug` → `decideJobVisibility` (`lib/jobs/jsonld.ts:114-119`): `CLOSED → "closed"`, non-`ACTIVE` → not-found, null `publishedAt` → not-found, inside the window → not-found. `not-found` calls `notFound()`, so sharing a URL cannot bypass the window.

The cutoff is applied in **five** places, not one: browse, detail, the apply transaction (`lib/db/application.ts:74`), the sitemap (`lib/db/directory.ts:60`), and the digest (`lib/services/digest.ts:65`). **It is missing from a sixth — see §11.1.**

### Flow C — freelancer applies (the quota)

| Step | File | What happens |
|---|---|---|
| Render gate | `app/jobs/[slug]/page.tsx:182-204` | `resolveApplyContext` returns `logged-out / finish-signup / not-freelancer / needs-onboarding / already-applied / quota-exhausted / can-apply`. Form renders only for `can-apply`. **Cosmetic.** |
| Action | `app/jobs/[slug]/actions.ts:33-67` | `requireRole("FREELANCER")` → `checkRateLimit("apply")` (30/hr) → `isPlausibleSlug` → Zod → `applyToJob` |
| Service | `lib/services/application.ts:96-152` | profile → job → `getUserPlan` → `applicationQuotaForPlan` → `earlyAccessCutoffFor` → `applyToJobTx` |
| DB | `lib/db/application.ts:50-107` | one `$transaction` (`maxWait 5000, timeout 10000`): row lock → re-verify job → duplicate check → count → create |
| Notify | `lib/services/notify.ts:73-88` | fire-and-forget after the tx, inside `after()` and a swallowing try/catch |

**The enforcement, in full** (`lib/db/application.ts`):

```ts
await tx.$queryRaw`SELECT "id" FROM "FreelancerProfile" WHERE "id" = ${freelancerId} FOR UPDATE`;  // :65
const used = await tx.application.count({                                                         // :86
  where: { freelancerId, createdAt: { gt: windowStart } },
});
if (quota !== null && used >= quota) {
  return { ok: false, reason: "quota-exceeded", used } as const;                                   // :89-91
}
```

- Quota: `applicationQuotaForPlan(plan)` → `null` for `FREELANCER_PRO`, else **12**. Plan is read server-side via `getUserPlan` → `entitledPlanFrom`, never from the request.
- Window: `now − 30 × 24 × 60 × 60 × 1000` ms, pure epoch arithmetic — DST- and timezone-immune. Comparison is `gt`, so the lower bound is **exclusive**.
- Status is ignored: `WITHDRAWN`/`REJECTED` rows still consume quota. **There is no refund path** — `Job → Application` is `onDelete: Restrict` precisely so deleting a job cannot refund quota.
- Concurrency: a pessimistic lock on the *freelancer's profile row*, taken as the first statement, serialises that freelancer's applies. `@@unique([jobId, freelancerId])` backstops the same-job case.
- **`P2002` is not caught** (`lib/services/application.ts:128-133` catches only `P2028` and `P2024`), unlike `lib/services/job.ts:98`. The row lock makes it unreachable for one freelancer, but the asymmetry is worth knowing.

The typed error is a discriminated union carrying numbers, not a message: `{ ok: false; reason: "quota-exceeded"; limit: number; used: number }`. It surfaces in three places — the form footer (button disabled), a pre-emptive panel on the job page with `nextSlotFreesAt`, and a 12-slot counter on the freelancer dashboard.

---

## 6. Data model

`prisma/schema.prisma`, 686 lines, 18 models. The generator writes to the **gitignored** `lib/generated/prisma`; the datasource block has no URL because Prisma 7 puts it in `prisma.config.ts`.

### Models

| Model | Purpose | Notable |
|---|---|---|
| `User` | Account root | `id @db.Uuid` with **no default** — it *is* the Supabase `auth.users.id` |
| `FreelancerProfile` | Public SEO profile | `slug`, `searchVector` (generated tsvector), `searchBoost`, `deactivatedAt` |
| `RecruiterProfile` | Company | `tier`, `isBanned`/`bannedReason`/`bannedAt`, `deactivatedAt` |
| `Job` | Posting | `publishedAt` write-once; `recruiterTier` denormalised for the indexed `?tier=` filter |
| `Category` / `Skill` | Taxonomy | `SkillOnJob`, `SkillOnFreelancer` join tables |
| `Application` | The quota unit | `@@unique([jobId, freelancerId])`; `→Job` is **Restrict** |
| `SavedJob` | Bookmark | PK `(freelancerId, jobId)` *is* the toggle idempotency |
| `Subscription` | Stripe state | `lastStripeEventAt` watermark; three unique columns |
| `RateLimit` | Fixed-window counter | `key` (hashed) as PK |
| `Engagement` | Mutual confirmation | Two party booleans; `isConfirmed`/`confirmedAt` derived **by a DB trigger** |
| `Review` | Rating + body | Composite FK to `Engagement(id, isConfirmed)` |
| `SafetyFlag` | Moderation | `isAutomated`, `matchedTerm` |
| `Report` | User report | `targetType` is an untyped string + `targetId` — **the one unconstrained polymorphic pointer, no FK** |
| `Conversation` | Thread | `applicationId @unique`, `outreachKey @unique` |
| `ConversationParticipant` | Membership + `lastReadAt` | PK `(conversationId, userId)` |
| `Message` | Body + `isFlagged` | |

**Enums:** `UserRole` FREELANCER/RECRUITER/ADMIN · `FreelancerVerification` NONE/ID_VERIFIED/ID_AND_WORK_VERIFIED · `RecruiterTier` UNVERIFIED/VERIFIED/TRUSTED · `JobStatus` DRAFT/PENDING_REVIEW/ACTIVE/CLOSED/REMOVED · `EngagementType` HOURLY/FIXED/PART_TIME/FULL_TIME · `ApplicationStatus` SUBMITTED/VIEWED/SHORTLISTED/REJECTED/WITHDRAWN · `PlanTier` FREE/FREELANCER_PRO/RECRUITER_GROWTH/RECRUITER_TEAM · `SubscriptionStatus` ACTIVE/PAST_DUE/CANCELED/TRIALING · `FlagReason` · `FlagStatus` OPEN/CLEARED/UPHELD.

### Indexes that exist for a specific query

- `Application_freelancerId_createdAt_idx` → the 30-day quota count (`lib/db/application.ts:86`)
- `Job_status_publishedAt_id_idx` → browse `ORDER BY publishedAt DESC, id DESC`; `id` is the keyset tiebreaker, and the `publishedAt` range is also the early-access filter
- `ConversationParticipant_inbox_idx` (4 columns) → the inbox query, single index scan, no sort
- `Engagement_recruiterId_confirmedAt_idx` → TRUSTED promotion counting distinct freelancers
- `FreelancerProfile_searchVector_idx` (GIN) → reachable only from raw SQL in `lib/db/candidate-search.ts`
- `RecruiterProfile_banned_bannedAt_idx` → **partial index**, raw SQL only, serves `/removed-employers`
- `User_jobDigestOptIn_lastJobDigestAt_idx` → digest recipient selection

### The unusual parts — read this before touching the schema

1. **Deliberate schema drift is a rule here, not a bug.** A large set of constraints exists **only in SQL**, because Prisma cannot express them: all the CHECKs, the `engagement_sync_confirmation_trg` trigger, the generated `searchVector` column, four party-binding FKs on `Review`, and the partial banned index. **Every migration header records that Prisma's proposed `DROP` statements were deleted by hand.** A future migration merged without that hand-edit silently removes database-level integrity gates.

2. **Three different soft deletes, meaning three different things.** `User.deletedAt` = anonymised account (email rewritten to `deleted-<uuid>@deleted.talent4u.invalid`). `*.deactivatedAt` = self-service page takedown. `RecruiterProfile.isBanned` = a moderator finding, published on `/removed-employers`.

3. **Role integrity via composite FK.** Profiles carry a pinned `userRole` half of a FK to `User(id, role)` with `ON UPDATE RESTRICT` plus a CHECK. A cross-role profile is impossible, and `User.role` is immutable while a profile exists.

4. **The review lock is four layers deep.** `engagementIsConfirmed` is pinned `true` by a CHECK and joined by composite FK to `Engagement(id, isConfirmed)` — so a review on an unconfirmed engagement has no FK target. A trigger derives `isConfirmed` from the two party booleans, and a second CHECK re-asserts the derivation if the trigger is dropped. Four more FKs bind author and subject to the engagement's actual parties.

5. **Denormalised columns:** `Job.recruiterTier` (snapshot at publish, for the indexed filter — cards render the live join), `FreelancerProfile.searchBoost`, `ConversationParticipant.lastMessageAt`, `Review.subject*Id`.

6. No multi-tenancy, no RLS policies in any migration.

### Migrations and seed

12 migrations in `prisma/migrations/`, named `YYYYMMDDHHMMSS_snake_case`, dated 2026-08-19 → 2026-08-28, each with a hand-written header explaining intent. The schema matches the sum of the migrations for every Prisma-visible object.

`prisma db seed` runs `tsx prisma/seed.ts` — configured in **`prisma.config.ts:29`**, because Prisma 7 no longer honours `package.json`'s `prisma.seed` key. The seed is fully **idempotent** (upsert on natural keys, otherwise sha256-derived stable ids) but timestamps move each run so the 6-hour early-access window stays testable.

It produces: 3 categories, 40 skills, 6 recruiters (each with a `Subscription` matching their tier), 138 freelancers, 15 jobs (10 ACTIVE / 2 DRAFT / 2 PENDING_REVIEW / 1 CLOSED), 30 applications, 4 engagements + reviews, and `admin@talent4u.test`. `PENDING_REVIEW` jobs get their `SafetyFlag` from the **real scanner**, not a copied term list.

**Seeded users cannot sign in.** They exist only in Postgres. Run `npx tsx prisma/dev-auth-users.ts` afterwards to create matching Supabase Auth users with the same ids and one shared password from `DEV_SEED_PASSWORD`; it refuses to run when `NODE_ENV`/`VERCEL_ENV` is production.

---

## 7. Cross-cutting concerns

### Pricing and entitlements

`lib/pricing/` is the single source of truth and the code holds that line — no USD amount appears outside `lib/pricing/prices.ts`.

`getEntitlements({ role, plan, recruiterTier })` is **pure** and takes **two** inputs, not one: a capability can be limited by the plan (what they pay for) or the verification tier (what we have confirmed), and **the effective answer is the stricter of the two**. An UNVERIFIED company on the Team plan still gets one post.

```ts
browseJobs: true                     // literal type, never computed
freelancer: { applicationsPerWindow, applicationWindowDays, earlyAccessDelayHours,
              searchBoost, applicationAnalytics }
recruiter:  { activeJobPosts, candidateSearch, searchFilters, pipelines, privateNotes,
              initiateMessages, receiveApplications, seats, companyPage, exportCandidates }
```

`initiateMessages` is **plan-independent** — bought with verification, not money. `candidateSearch` is the money gate.

**Regional pricing:** `PriceBand = STANDARD | MID | LOW`, resolved from `User.billingCountry` (written back from Stripe's card-verified address at checkout) through `bandForCountry`. Unmapped or null → STANDARD, deliberately: never guess a discount from an absent signal. Amounts are integer cents in a single currency: Pro 600/400/300, Growth 7900/4900/2900, Team 24900/15900/9900.

**`lib/pricing/gate-audit.test.ts` is the invariant pin.** 289 lines written as an audit, not unit tests: each block names the CLAUDE.md rule it enforces and **enumerates** all 4 plans × 3 tiers × roles rather than sampling. It even asserts that `JSON.stringify(getEntitlements(...))` never matches `/commission|payout|escrow|feePercent|takeRate/i`. **Widening `PlanTier` fails here first**, by design. If you change a gate, this is the file that will tell you what you broke.

### Stripe

Checkout never accepts an amount from the client — `unit_amount` comes from `priceFor(plan, bandForCountry(account.billingCountry))`. `subscription_data.metadata = { userId, plan, band }` is written onto the *subscription*, not just the session. Sessions expire after 30 minutes so two open sessions cannot both be paid.

**Idempotency has no processed-events table.** The mechanism is a watermark column (`Subscription.lastStripeEventAt`) plus three unique constraints, with all refusals expressed as the WHERE clause of a single conditional `updateMany` (READ COMMITTED-safe), returning `"applied" | "stale" | "superseded" | "conflict"`. Stale events use `lte` for our own stream and strict `lt` for anything that takes a plan away.

Unknown Stripe statuses map to `PAST_DUE` — **fail closed**. `entitledPlanFrom` is the one function behind every gate: non-live status → FREE, and a live-looking row past `ENTITLEMENT_GRACE_DAYS = 14` → FREE. A **null** `currentPeriodEnd` is treated as "unknown", not "expired" — deliberate, so a partial webhook payload cannot cut off a paying customer, but it also means such a row reads as paid indefinitely.

With `STRIPE_*` unset nothing throws at import: the billing page renders an explanatory notice with every button disabled, and the rest of the product is unaffected.

### Safety scanner

`scanTextForSafetyFlags(text)` in `lib/services/safety.ts:179` — pure, three categories, terms in `lib/config/safety-terms.ts` so they can be edited without touching code:

| Reason | Trigger |
|---|---|
| `UPFRONT_PAYMENT` | any of 11 phrases (registration fee, security deposit, training fee, equipment purchase, processing fee, …) |
| `LONG_UNPAID_TEST` | an unpaid-test mention that is not clause-locally negated and whose estimated hours are unbounded **or > 4** |
| `OFF_PLATFORM_PAYMENT` | a payment-app handle within 18 tokens of payment-request language |

`normalizeForScan` does NFKC, strips format/combining marks, folds Cyrillic homoglyphs, and preserves sentence/clause marks so negations cannot leak across clauses. Matching is whole-token with plural tolerance.

**Negation is asymmetric, and it is easy to get wrong.** It is checked only for unpaid-test terms (`safety.ts:193`) and only within `NEGATION_LOOKBACK_TOKENS` (4) of the match. `UPFRONT_PAYMENT` terms flag **unconditionally** — "We never ask for a registration fee" is a flag. Both facts are now pinned in `lib/services/profile-safety.test.ts`.

**Two call sites, and they behave differently on purpose.** Jobs are scanned *inside* the publish transaction and **held** (`PENDING_REVIEW`, no `publishedAt`). Messages are scanned **after** persistence and only flagged — delivered, emailed, then marked. The deviation is documented at `lib/services/message-safety.ts:8-16`. Company profile prose is **not scanned at all** (see §11.3).

### Verification

**Recruiter tiers.** UNVERIFIED → VERIFIED is **human-only**: the recruiter self-submits, an ADMIN approves, and readiness is re-run at decision time. The three requirements are a business-domain email (checked against the *Supabase account email*, rejecting ~70 consumer mailbox hosts and public suffixes), a registration number (length ≥ 2), and a LinkedIn URL (non-empty — **nothing matches it to the company**).

**TRUSTED auto-promotion exists but only from VERIFIED**, never from UNVERIFIED — at 3 **distinct confirmed freelancers**, not 3 engagements. `lib/services/verification.ts:11-13` flags the BUILD_PLAN wording as the drift.

**Freelancer verification has no ID vendor.** `lib/services/freelancer-verification.ts:18-20` states it: *"There is no ID provider in this sprint."* Only the work-link half ships — link GitHub / portfolio / LinkedIn, admin approves, and approval stores the marker string `"approved:work-links-approved"` in `verificationNote`. **`lib/db/freelancer-verification.ts` contains no function that can write `verification` or `verifiedAt`**, so the badge never leaves "Not verified" in production. (The seed writes `ID_AND_WORK_VERIFIED`, a state production code cannot reach.)

### Engagements and reviews

Reviews are locked until both parties confirm, with stated rate and duration. The service gate is `lib/services/engagement.ts:433-435`; author and subject are derived from the session's side, never sent by the caller. Confirmation refuses self-confirmation, requires both terms, and re-reads them under `FOR UPDATE`, returning `terms-changed` if the proposer amended. Parties are derived from a shared `Application`, so a recruiter cannot farm TRUSTED against strangers.

This rule is defended at four layers (service + three database-level mechanisms) and is the best-protected invariant in the codebase. `prisma/verify-engagement.ts` already runs both attacks — service refusal and a raw `prisma.review.create` bypass — and asserts both fail.

### Moderation

The queue is `/admin`, FIFO oldest-first (newest-first would strand the oldest holds in `PENDING_REVIEW` forever). `clearFlagTx` locks the Job row first so sibling flags serialise, and publishes `PENDING_REVIEW → ACTIVE` only when it was the **last** open flag. `banRecruiterTx` is one transaction: set the ban fields, transition **every** non-REMOVED job to `REMOVED`, force-uphold all their OPEN flags. `/removed-employers` is populated solely by `where: { isBanned: true }` — a ban publishes immediately, with no curation step.

Reports target **jobs and companies only**; freelancers and messages are not reportable. Any signed-in user may report. Limits: one open report per person per target, 5 open reports per user, plus a rate limit.

### Email

Raw `fetch` to `https://api.resend.com/emails` with an 8-second timeout. **No SDK, no React Email** — templates are hand-written table-based HTML in `lib/email/layout.ts`, which rejects React Email explicitly ("an email is not a React app"). Plain text is always sent alongside.

Without `RESEND_API_KEY`: development logs each message to the console and returns `{ ok: true, skipped: true }`; production returns a failure rather than dropping mail silently.

11 notification types, all dispatched through `fireAndForget` → `after()`, catching everything. **Outside a request scope it schedules nothing** — so scripts and tests silently send no mail. Every recipient lookup drops banned recruiters.

**Only the digest carries an unsubscribe link**, and no `List-Unsubscribe` header is ever set (the `headers` field exists on `OutboundEmail` but `deliver()` never fills it), so Gmail/Yahoo one-click unsubscribe is unimplemented. The token is minted lazily and **never rotated**. `/unsubscribe` acts on the **GET**, with a documented mail-scanner false-positive risk.

### Weekly digest

Tuesdays 09:00 UTC. Selects freelancers with `jobDigestOptIn`, not deactivated, whose `lastJobDigestAt` is null or older than 7 days; max 200 accounts per run, 6 jobs each. Matching is by shared skills, re-sorted by matched-skill count. **Marked before sent**, so the guarantee is at-most-once. The early-access cutoff is applied to everyone, so there is no leak through email.

### Rate limiting

**Fixed window, in Postgres, atomic.** One `INSERT … ON CONFLICT DO UPDATE` with a `CASE WHEN windowStart <= now() - interval THEN 1 ELSE count + 1 END`. Not a token bucket, not sliding. Keys are `${action}:${sha256(subject)}` — IPs and emails are hashed, never stored plain. Pruned weekly by the digest cron.

Policies: `sign-in` 10/15m · `sign-up` 5/1h · `password-reset` 5/1h · `apply` 30/1h · `message` 60/1h · `outreach` 40/24h · `job-write` 40/24h · `report` 20/1h · `checkout` 10/1h · `profile-write` 60/1h.

**It fails OPEN** (`lib/services/rate-limit.ts:93-99`) — a limiter error allows the mutation and logs. This is a deliberate, documented trade: every real authorization rule fails **closed**; this one is a backstop against abuse and is not allowed to take signups down with it.

Covered at 23 call sites. Deliberately not covered (documented at `rate-limit.ts:22-38`): `app/admin/actions.ts` and both onboarding actions. **Undocumented omissions:** `saveJobDigest`, `decideApplication`, `saveApplicationNote`, and every engagement action except `proposeEngagement`.

### Storage

Two public-read Supabase buckets written through a `server-only` admin client. `company-logos` must be created by hand; `avatars` self-provisions. Validation is **MIME type and size only** — `image/png|jpeg|webp`, ≤ 2 MB. No magic-byte sniffing, no re-encode. Path is `${userId}/${randomUUID()}.${ext}` with `upsert: false`. **There is no deletion path** — replacing an avatar orphans the old object, and account deletion nulls the URL but leaves the file publicly readable.

### SEO

`app/sitemap.ts` is `force-dynamic`, capped at 5000 rows per section, newest-first, behind `unstable_cache(revalidate: 900)` with the early-access cutoff **quantized to a 15-minute bucket** so the cache key is stable. `app/robots.ts` disallows `/dashboard /admin /onboarding /api /dev` and is documented as advisory, not an authorization boundary. Two OG image routes, both `next/og`. JSON-LD: `JobPosting` (only when fully visible), `ItemList` on browse, `Person`/`Organization` on profiles.

### Metrics

All three BUILD_PLAN north-star ratios are implemented as raw SQL in `lib/db/metrics.ts` (per-row relative windows Prisma cannot express): jobs with ≥5 applications within 48h, recruiters posting again within 60 days, freelancers hearing back within 30 days. `VIEWED` is deliberately excluded from "heard back". Empty denominators return `percent: null`, not 0. There is no signups counter — an explicit anti-goal.

### Account deletion

Nothing is row-deleted except freelancer skills. Three ordered steps: cancel the Stripe subscription (aborts with `billing-unreachable` if Stripe errors), anonymise in one transaction, then `supabase.auth.admin.deleteUser` last. Applications, engagements, reviews, messages and conversations are **retained** — they are shared history belonging to the counterparty. Live jobs move to `CLOSED`. **Supabase Storage objects are not touched** — worth flagging against a GDPR erasure claim.

### Observability

**Sentry is not wired.** The only two references are `BUILD_PLAN.md` and the comment in `lib/observability/report-error.ts:5` explaining that adding a dependency needs permission, so this is the seam rather than the thing. `reportError(error, { scope, digest?, extra? })` emits one line of JSON to `console.error` and can never throw; there are 5 call sites. Everything else uses ad-hoc `console.error` with a bracketed prefix (`[notify]`, `[email]`, `[rate-limit]`, `[digest]`).

### i18n, feature flags, caching

**None, none, and almost none.** No i18n library, no locale segments, all copy hard-coded English. No feature flags — behaviour switches are config constants (`EARLY_ACCESS_HOURS`, the pricing config) or env presence (`stripeConfigured()`). Caching is React `cache()` for request dedup plus exactly two `unstable_cache` calls (`getPublicStats` 300s, `readSitemapRows` 900s). **`revalidatePath`, `revalidateTag` and `router.refresh` appear nowhere in the repo.**

---

## 8. Conventions

These are the unwritten rules. Most differ from what you would write by default in a Next.js app.

### 8.1 The `notices.ts` pattern — the house convention

Eleven `notices.ts` files sit next to their `actions.ts`. **The rule: Server Actions never return user-facing copy. They redirect with a short opaque code on `?notice=`, and `notices.ts` is the only place a code becomes a sentence.**

An unknown code resolves to `null`, and that is a security property, not tidiness: a free-text `?notice=` on a password page would be self-hosted phishing (`app/dashboard/settings/notices.ts:1-12`).

Two implementations coexist:
- **Zod-enum-backed** where the code set is large: the enum lives in `lib/validations/<domain>.ts`, the copy map is a `Record<Notice, Copy>`, resolve is `safeParse` → `COPY[parsed.data]`.
- **Switch-backed** for smaller sets (`app/report/notices.ts`, `app/dashboard/messages/notices.ts`).

Notices may carry numeric params with a defensive clamp (`resolveJobNotice({notice, cap, used})`). Types are shared across segments by import.

Page side is always the same three lines:

```tsx
const notice = resolveSettingsNotice(params.notice);
{notice ? <Notice tone={notice.tone} className="mb-8">{notice.message}</Notice> : null}
```

`searchParams` is a Promise and is `Promise.all`'d with the data read. `Notice` sets `role="alert"` for errors and prefixes a literal word ("Done"/"Heads up"/"Not done") so tone survives greyscale.

**To add one:** add the code to the segment's enum or switch, write the copy in `notices.ts`, `redirect(\`${PAGE}?notice=<code>\`)` from the action.

### 8.2 Server Action signatures — exactly two, no third

**(a) Redirect-only, `Promise<void>`** — the default:

```ts
export async function saveJobDigest(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const result = await setJobDigestForUser(user.id, { optIn: formData.get("optIn") });
  if (!result.ok) { back("failed"); return; }
  back(result.optIn ? "digest_on" : "digest_off");
}
```

**(b) `useActionState`**, for forms with per-field errors. The state shape is invariant: `{ fieldErrors: Record<string,string>; formError: string | null }`. Note that a `"use server"` file may only export async functions, so the *initial state object* lives in the client component.

**Order inside every action is fixed:**

```
requireUser() / requireRole(role)   →   checkRateLimit(bucket, user.id)   →   Zod safeParse   →   service
```

Actions never `throw` and never `return { error }`. Service failure `reason` strings are mapped to notice codes via a `NOTICE_BY_REASON` record with a `?? "failed"` fallback. **The redirect is the refresh** — there is no cache invalidation anywhere.

### 8.3 Layering contract

- **`lib/db/*`** — Prisma only, "No business logic here". Row types are exported as `NonNullable<Awaited<ReturnType<typeof fn>>>`. Writers return `boolean` from `updateMany().count === 1`, so **the WHERE clause is the lock** and idempotence is structural.
- **`lib/services/*`** — Zod parsing, rules, and a **discriminated result union per operation**: `{ ok: true; … } | { ok: false; reason: "kebab-case-literal" }`. Side effects that need request scope are **injected as parameters** so the rule stays unit-testable (e.g. `changePassword(raw, updatePassword)`, `publishJobTx({ scan })`).
- **`app/**/actions.ts`** — auth, rate limit, FormData→object, redirect. No Prisma, no SQL.
- **Pages / Server Components** — may import `lib/db` directly for reads (~21 do). Services are for writes and view assembly. Only 13 of 104 `.tsx` files are `"use client"`.

### 8.4 Concurrency idiom

Every quota or cap uses `SELECT … FOR UPDATE` inside a `$transaction`, plus conditional `updateMany` where the WHERE clause *is* the lock. Prisma error codes are mapped deliberately: `P2028`/`P2024` → a retryable `"conflict"`, `P2002` → a specific reason (`already-exists`, `already-reviewed`, slug retry). Copy this pattern rather than inventing a new one.

### 8.5 Zod (v4)

All schemas in `lib/validations/<domain>.ts`, named `<thing>Schema` with `export type <Thing>Input = z.infer<typeof …>`. v4 idioms in use: top-level `z.email("…")` not `z.string().email()`, `z.literal("on").optional()` to model an unchecked checkbox honestly, `z.coerce`. Errors are read via `parsed.error.issues` at 13 sites — **never `.flatten()` or `treeifyError`**. Field errors are extracted by a hand-rolled first-issue-wins loop. Messages name the fix ("Choose a country from the list."). Shared refinements are factories in `lib/validations/url.ts` guarding `new URL()` with `URL.canParse`.

Query-parameter parsers are deliberately **forgiving**: invalid values are dropped, never 400. Ids and slugs are short-circuited by `isPlausibleSlug` / `isPlausibleId` / `isUuid` so malformed input 404s instead of reaching Postgres.

### 8.6 Styling

Tailwind **v4**, CSS-first (`@import "tailwindcss"` + `@import "shadcn/tailwind.css"`), **no `tailwind.config`**. Brand hex values sit on `:root`/`.dark` and map into Tailwind via `@theme inline`. Dark mode is class-based: `@custom-variant dark (&:is(.dark *))`. **Status colours flip per theme, so components carry no `dark:` variants** — do not add them.

A `@layer components` block defines the vocabulary to use **instead of ad-hoc utilities**: `.t-display-1/-2 .t-heading .t-subhead .t-body .t-body-dense .t-label .t-data`, plus `.tabular .rowset .row-hover .surface-card .surface-card-interactive .chip*`.

`cva` is used in exactly one file, `components/ui/button.tsx`. Other primitives share plain string constants in `components/ui/field-styles.ts`. Form a11y is structural: `<Field label htmlFor hint error>` plus `fieldControlProps(id, …)` spread onto the control.

Icons are **hand-drawn inline SVG** in `components/ui/icon.tsx` — a shared `<Svg>` at `strokeWidth={1.5}`, `strokeLinecap="square"`, 24px grid, `aria-hidden` unless a `label` is passed. Do not reach for `@hugeicons` even though it is installed.

### 8.7 Naming

Files are kebab-case. Route-local files are the fixed set `page.tsx | layout.tsx | actions.ts | notices.ts | <thing>-form.tsx`. Tests are `*.test.ts` colocated beside the source.

Services are `<verb><Noun>ForUser(userId, …)` — **`userId` is always the first parameter and always comes from the guard, never the form.** DB functions are `get*/list*/count*/set*/update*` with `<Thing>Row` types. Result types are `<Operation>Result` unions; failure reasons are kebab-case literals in services and snake_case notice codes in the URL.

Imports are three grouped blocks (node/next → `@/…` → relative), everything internal through the `@/*` alias.

### 8.8 Comment register

Doc comments here are long and argue *why*, including what was rejected and what the trade-off costs. Several encode open product questions (`lib/pricing/entitlements.ts:146-154`). **Matching that register is part of the convention** — a terse one-liner in this codebase reads as unfinished.

### 8.9 Git habits

39 commits, all between 2026-08-19 and 2026-08-28 — a ten-day burst, then nothing. Conventional Commits with phase/session references matching `BUILD_PLAN.md` (`feat(pricing): one source of truth for every gate, pinned by an audit suite`). **~26 files per commit** — slices are very large, one whole vertical feature per commit. Single branch `master`; no PRs, no feature branches in the history.

---

## 9. Verified commands

Run on 2026-09-11, Windows 11, Node v22.18.0, npm 10.9.3.

| Task | Command | Result |
|---|---|---|
| Install | `npm ci` | Not re-run — `node_modules` already present and consistent with the lockfile |
| Generate client | `npm run db:generate` (`prisma generate`) | **PASS** — ~47s |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **FAIL then PASS** — see below. ~42s once the client is current |
| Lint | `npm run lint` (`eslint`) | **PASS**, zero warnings — ~2m 0s |
| Tests | `npm test` (`vitest run`) | **849 passed, 1 failed** of 850, 48 files — ~21s |
| Build | `npm run build` (`prisma generate && next build`) | **FAIL** — requires a reachable database, see below |
| Dev server | `npm run dev` | Not run (would need a live DB) |
| One test file | `npx vitest run lib/services/application.test.ts` | — |
| One test by name | `npx vitest run -t "<test name>"` | — |
| Migrate (dev) | `npm run db:migrate` | Needs `SHADOW_DATABASE_URL` — see §9.3 |
| Migrate (deploy) | `npm run db:deploy` | No shadow DB needed |
| Seed | `npm run db:seed`, then `npx tsx prisma/dev-auth-users.ts` | Both needed — seeded users cannot sign in without the second |
| Studio | `npm run db:studio` | |

### 9.1 Typecheck fails against a stale generated client — the single biggest local gotcha

On a fresh checkout `npm run typecheck` produced **41 errors** in `lib/services/settings.ts` and five `prisma/verify-*.ts` files, all of the form *"Property 'deletedAt' does not exist"*, *"'jobDigestOptIn' does not exist"*, *"'outreachKey' does not exist"*, *"Property 'rateLimit' does not exist on type 'PrismaClient'"*.

**None of these were real.** `lib/generated/prisma` is gitignored build output and was stale relative to the last four migrations. After `npx prisma generate`, `tsc --noEmit` exits **0**.

Run `npm run db:generate` after any pull that touches `prisma/`, before believing a type error.

### 9.2 The build needs a live database

`next build` fails at prerender:

```
Error occurred prerendering page "/"
  at async g.revalidate (lib\db\stats.ts:13:50)
  at async g (lib\marketing\proof.ts:33:50)
  at async m (app\(marketing)\page.tsx:86:17)
```

The landing page is statically prerendered and calls `getPublicStats()`, which issues three `count()` queries. **There is no `force-dynamic` on `app/(marketing)/page.tsx`.**

Note the inconsistency: `app/sitemap.ts:34` carries the comment *"The database is not reachable at build time on Vercel"* and sets `force-dynamic` for that reason — but the homepage does reach for the database at build time and has no such guard. Either the sitemap comment is wrong about the deployment, or the homepage is one outage away from a failed deploy.

### 9.3 Environment state at the time of writing

The Supabase host in the local `.env` **does not resolve**: `(ENOTFOUND) tenant/user postgres.<project-ref> not found`. The project appears paused, deleted, or the credentials are stale. This is an environment fact, not a code fault, and it is why the build could not complete and why some tests logged connection errors.

Two commands above did attempt an outbound connection to that host as a side effect of normal verification — `npm test` (through the rate limiter, which then failed open) and `npm run build` (through the homepage prerender). Both failed at DNS resolution, so nothing was read or written.

### 9.4 Local database setup

1. Copy `.env.example` → `.env` and fill it in.
2. `DATABASE_URL` = Supabase **transaction pooler**, port 6543 (runtime). `DIRECT_URL` = **session** connection, port 5432 (CLI only).
3. `npm run db:deploy` applies migrations without a shadow database. **`npm run db:migrate` (`migrate dev`) additionally needs `SHADOW_DATABASE_URL`** pointed at a second Postgres — Supabase's pooler cannot create the throwaway database Prisma wants. That variable is **not listed in `.env.example`**.
4. `npm run db:seed`, then `npx tsx prisma/dev-auth-users.ts`.
5. Stripe locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
6. The cron by hand: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/job-digest`.

---

## 10. Testing

**48 `.test.ts` files, ~850 cases, zero `.tsx` tests.**

**Style: the database is mocked at the module boundary** — never faked, never real. Tests `vi.mock` the `lib/db/*` module the service imports, so Prisma never loads:

```ts
vi.mock("@/lib/db/application", () => ({ applyToJobTx: vi.fn(), countApplicationsSince: vi.fn(), … }));
```

Where a pure helper lives in a module that imports the client, the client itself is stubbed: `vi.mock("./client", () => ({ prisma: {} }))`. Prisma error classes are faked via `vi.hoisted` so `P2028` mapping can be exercised without the generated client.

**No factory library and no fixture files** — each suite defines local builder closures cast to the real return type (`account()`, `sub()`). Assertions frequently check *call arguments and invocation order* rather than return values.

`tests/setup.ts` is two lines: `import "dotenv/config"` (Vitest runs outside Next, so `.env` is not loaded for it).

No `.skip`, `.todo`, `.only`, `xit` or `xdescribe` anywhere in the repo.

**Testing a `next/og` route:** mock `ImageResponse` as a **class**, not an arrow function — the route calls it with `new`. Assert on the text of the captured element rather than on pixels. See `app/jobs/[slug]/opengraph-image.test.ts`.

**Watch for scoped resets.** `lib/services/freelancer.test.ts` puts its `beforeEach(() => vi.resetAllMocks())` *inside* a describe block, so a new top-level block inherits call counts from earlier tests and asserts like `not.toHaveBeenCalled()` fail for no visible reason.

**Never hardcode a date in a fixture** that flows into code reading the real clock — see §11.12.

### What has direct coverage

Browsing free for logged-out · the 12/30-day quota arithmetic · quota enforced in the service not the UI · Pro unlimited + no cutoff · early access as a query filter · recruiter caps 1/5/∞ · the paid wall (search, filters, pipelines, notes) · outbound messaging closed to free recruiters · UNVERIFIED capped at 1 post on any plan and cannot initiate · VERIFIED requirements · TRUSTED threshold · freelancer work-link readiness · reviews locked until both confirm · all three safety categories (with an adversarial corpus) · hold-don't-publish for jobs · regional pricing · the 0%-commission and no-"tax free" copy guards.

### What is not covered

- **The atomic transactions themselves.** `applyToJobTx` and `publishJobTx` are always `vi.fn()`. Nothing — no unit test, no verify script — proves the `FOR UPDATE` lock actually stops a 13th concurrent application or a 6th concurrent publish. This is the load-bearing code with the thinnest proof.
- **Tier labels rendered on cards.** Only the pure `recruiterTierBadge` label function is tested. No component render test exists anywhere.
- **Any `app/api/` route handler or Server Action.** The HTTP/auth boundary is untested; only the services beneath it are. `app/` has exactly one test (`sitemap.test.ts`).
- "Never hardcode USD in components" — no lint rule or test enforces it.
- `/removed-employers` has no test.

**Two structurally weak assertions worth knowing:** `job-browse.test.ts:36` and `:90` assert absence via `JSON.stringify(where)).not.toContain("publishedAt")` — string matching on a query object, which silently passes if the key is renamed. `job.test.ts:176` asserts `args.scan === scanTextForSafetyFlags` (identity, not behaviour) — the scanner is never actually run through the publish path.

### Integration testing: 16 `prisma/verify-*.ts` scripts

There is no Playwright/Cypress/testing-library. The substitute is 16 hand-rolled scripts in `prisma/`: `verify-account-deletion, -billing, -billing-page, -candidate-search, -digest, -engagement, -entitlements, -messaging, -metrics, -moderation, -outreach, -rate-limit, -seed, -sprint, -ui, -webhook`.

**They hit a real database.** They import the production client directly, query seeded rows, mutate them, assert, then restore. `verify-entitlements.ts:10-14` states the division of labour: *"The pure matrix is unit-tested in lib/pricing; what only a live database can show is that getEntitlementContext's query shape actually returns the plan."*

**They are not wired into npm.** There is no `verify` script; each file's header gives its command (`npx tsx prisma/verify-entitlements.ts`). Three additionally need the dev server running (`verify-ui`, `verify-billing-page`, `verify-webhook`). All require a seeded database. So real integration coverage exists, but it is unautomated, uncounted, and depends on seed state — and **nothing prevents pointing one at production**.

---

## 11. Verified gaps and risks

Each of these was confirmed by opening the file, not inferred from a report.

### 11.1 ~~The job OG image route has no visibility check~~ — **FIXED 2026-09-11**

*Kept as the record of what it was. Fix: `decideJobVisibility` plus the anonymous cutoff in `app/jobs/[slug]/opengraph-image.tsx`, covered by `app/jobs/[slug]/opengraph-image.test.ts` and confirmed against the live database — a held, a draft and a missing slug all return the byte-identical fallback card while a live job renders its own. Original description follows.*

**`app/jobs/[slug]/opengraph-image.tsx`** imports exactly one thing from the data layer:

```ts
import { getPublicJobBySlug } from "@/lib/db/job-browse";
...
const job = await getPublicJobBySlug(slug).catch(() => null);
```

It never calls `resolveEarlyAccessCutoff()` or `decideJobVisibility()` — neither is imported in the file. `getPublicJobBySlug` is a bare `findUnique({ where: { slug } })` whose own docblock states the contract this route breaks (`lib/db/job-browse.ts:169-172`): *"Visibility rules (status / window / banned) are decided by the caller via decideJobVisibility — this returns any job."* The sibling `page.tsx` honours it via `loadJobView`; the OG route does not.

**Effect:** an unauthenticated request to `/jobs/<slug>/opengraph-image` returns a 1200×630 PNG containing the job **title, company name, verification-tier label, budget range and remote/location** for a job whose `/jobs/<slug>` page 404s. Because there is no status check either, the blast radius is wider than the 6-hour window: it also covers **`DRAFT`** jobs (slugs are assigned at draft creation), **`PENDING_REVIEW`** jobs the safety scanner is holding, **`REMOVED`** scam posts, and posts by banned or deactivated recruiters — every state `decideJobVisibility` exists to suppress. Slugs are derived from titles (`base`, `base-2`, …), so they are guessable.

Leaking a post the scanner held, or one a moderator removed, is the part that matters given the trust model.

**Fix shape:** gate on `decideJobVisibility(..., await resolveEarlyAccessCutoff())` and fall back to the generic site card for anything but `"full"`/`"closed"`.

### 11.2 Messages are delivered and emailed, then flagged — never held *(OPEN — product decision)*

`scanMessageOnWrite` is called *after* persistence at `lib/services/message.ts:207`, `:293` and `:324`, and `onMessageSent(...)` fires the email regardless of `scan.flagged`. A recruiter can send "wire the $200 security deposit via Telegram"; it is stored, delivered and emailed, and only `isFlagged` is set afterwards.

This is **intentional and documented** (`lib/services/message-safety.ts:8-16`), but CLAUDE.md's "Hold for human review, do not auto-publish, when a post **or message** contains…" is false for messages. Decide whether to change the code or the rule.

### 11.3 ~~Company profile prose bypasses the scanner entirely~~ — **FIXED 2026-09-11**

*It was wider than this section recorded: **four** write paths, not one — company description and freelancer bio, on both the edit and the onboarding path. Guarding only the editor would have left the front door open, since a scam company would simply arrive with the text already in place. Fix: `lib/services/profile-safety.ts`, which refuses the write — a third shape from held-jobs and flagged-messages, because a profile has no state to be held in. Original description follows.*

`updateCompanyProfileForUser` (`lib/services/profile-edit.ts:160-181`) writes `companyName` and `description` with **no** `scanTextForSafetyFlags` call. That text renders on `/companies/[slug]` and beside every job card.

**Exploit:** publish a clean job, then move "A refundable deposit is required — contact us on Telegram" into the company description. It goes live immediately, indexed, with no `SafetyFlag`. Confirmed: the only two scanner call sites in the repo are job publish and message write.

### 11.4 ~~The weekly digest strips the tier label off job cards~~ — **FIXED 2026-09-11**

*`tier` now travels from `lib/db/digest.ts` through to both the HTML and the plain-text mail, labelled via the shared `recruiterTierBadge` so it cannot drift from the on-site cards. Verified against real rows.*

`lib/db/digest.ts:134` selects `recruiter: { select: { companyName: true } }` — **no `tier`** — and `lib/email/layout.ts` renders title + company + budget only. An UNVERIFIED employer's job is mailed weekly to opted-in freelancers with no "Unverified" label anywhere in the mail. Same omission, smaller blast radius, on the freelancer dashboard's application rows.

CLAUDE.md: *"Tier labels must be visible on every job card… Never hide an unverified label to make the UI cleaner."*

### 11.5 The Pro search boost is inert in production

`FreelancerProfile.searchBoost` is the first `ORDER BY` term in candidate search and the schema comment says its single writer is the Stripe webhook. **No production code writes it.** Repo-wide grep finds writes only in `prisma/seed.ts:224`, `prisma/verify-*.ts`, and one reset to `false` in `lib/db/account-deletion.ts:78`. `lib/db/subscription.ts`, `lib/services/billing.ts` and the webhook route contain no reference.

So for every real user the value is permanently `false`, while `lib/pricing/catalogue.ts:93` advertises "Search boost on your profile" and `app/dashboard/recruiter/candidates/page.tsx:210` tells recruiters "Pro members appear first". A paid feature that is sold and not delivered.

### 11.6 Freelancer verification can never leave "Not verified"

Per §7: there is no ID vendor, and `lib/db/freelancer-verification.ts` contains no function that can write `verification` or `verifiedAt`. `ID_VERIFIED` and `ID_AND_WORK_VERIFIED` are reachable only from the seed. Candidate search offers a `verification` filter over values production cannot produce.

### 11.7 Advertised entitlements with no implementation

`exportCandidates` (Team), `applicationAnalytics` (Pro) and `seats: 5` (Team) appear only in `lib/pricing/*` and the catalogue. There is no feature behind them and no enforcement site. `searchFilters` and `pipelines` have no enforcement site either — filters are walled only *transitively* by the page-level refusal, so a filter UI added on any other surface would be ungated.

### 11.8 Freelancers cannot withdraw an application

`WITHDRAWN` exists in the enum, the recruiter's filter, the badge map, the engagement exclusion and the seed data — but **nothing in `app/` or `lib/` ever writes it**. And since the quota counts by `createdAt` regardless of status, withdrawing would not refund quota anyway.

### 11.9 Downgrade does not reclaim job slots

No code in `lib/db/subscription.ts` or `lib/services/billing.ts` touches `Job`. A Growth recruiter with 5 active posts who lapses to FREE keeps all 5 live. Deliberate and documented (`lib/services/billing.ts:46-51`), but it makes "Free = 1 active post" a **publish-time** rule, not a steady-state invariant.

### 11.10 A null `currentPeriodEnd` grants a paid plan indefinitely

`isGraceExpired` returns `false` when `currentPeriodEnd` is null, by design (a partial webhook payload must not cut off a paying customer). But a `Subscription` row left at a live status with a null period end reads as its paid plan forever, with no expiry. Reachable only through a partial Stripe payload.

### 11.11 Other security-sensitive surfaces

- **`app/api/stripe/webhook/route.ts`** — the sole path to a paid plan.
- **`prisma/verify-*.ts`** (16 scripts) mutate real data; `verify-engagement.ts:320` runs a raw `$executeRaw UPDATE`. Nothing stops one being pointed at production.
- **`lib/db/account-deletion.ts`** + `app/dashboard/settings/actions.ts` — irreversible, and it leaves storage objects behind.
- **Raw SQL** lives in `lib/db/candidate-search.ts` and `lib/db/metrics.ts`. All of it is tagged-template parameterised; there is no `$queryRawUnsafe` / `$executeRawUnsafe` anywhere.
- **Upload validation is MIME + size only** — no magic-byte check.
- **`app/dev/states/page.tsx`** is guarded by a runtime `NODE_ENV` read plus `robots: noindex`. Low risk (Vercel previews set production), but the guard is runtime, not a build-time exclusion, so one misconfiguration exposes an internal design page. Embarrassing, not dangerous.

### 11.12 ~~One failing test — a stale fixture date~~ — **FIXED 2026-09-11**

*The fixture is now an offset from `Date.now()`. The other ~40 absolute dates in the suite are each paired with an explicit `now` parameter, so they are deterministic and were left alone.*

```
FAIL lib/services/billing.test.ts > getBillingView > does not call a live subscription grace-expired
AssertionError: expected null not to be null   at lib/services/billing.test.ts:617
```

The `sub()` fixture defaults to `currentPeriodEnd: new Date("2026-09-01T00:00:00Z")` (`billing.test.ts:78`). `lib/services/billing.ts:159-161` nulls `currentPeriodEnd` whenever it is in the past:

```ts
currentPeriodEnd:
  sub?.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
    ? sub.currentPeriodEnd
    : null,
```

Today is 2026-09-11, so the fixture date is 10 days past. `graceExpired` is still `false` (grace is 14 days), which is exactly the observed failure signature: line 616 passes, 617 fails. **The suite was green when committed on 2026-08-28 and started failing on 2026-09-01.** The fix is a relative date in the fixture, not a change to `billing.ts`.

### 11.13 Debt is otherwise unusually low

**Zero** `TODO`, `FIXME`, `HACK`, `XXX`, `@ts-ignore` or `@ts-expect-error` outside `lib/generated/`. Exactly one loose `any`, in a test, with a justifying disable comment. Three `eslint-disable`s, all narrow and commented. `strict: true`.

**Dead code (verified, still open):** `lib/auth/index.ts` (barrel, zero importers); `lib/brand/contrast.ts` (imported only by its own test — it is a standing WCAG assertion, so keep it, perhaps under `tests/`); `canSearchCandidates` in `lib/services/candidate-search.ts:104` (zero production callers, and its docstring claims "the nav uses this" while `components/shell/shell-nav.tsx:65-67` renders the link unconditionally).

**Incomplete refactor:** commit `2fe9144` ("remove 'measure' class") only partly removed it. `.measure` still exists in `app/globals.css:345` and is used in **11 files**, and the removal left orphan double spaces in `className` strings (`app/dashboard/settings/page.tsx:72`, `app/error.tsx:45`). Treat `.measure` as an unfinished migration, not a rule.

### 11.14 Hotspots and size

Churn leaders: `prisma/schema.prisma` (13 commits), `app/dashboard/freelancer/page.tsx` (13), `app/jobs/[slug]/page.tsx` (11), `app/jobs/page.tsx` (10), `app/dashboard/recruiter/page.tsx` (10).

Largest hand-written files:

| File | Lines | Verdict |
|---|---|---|
| `app/jobs/page.tsx` | 846 | **Refactor candidate** — one default export plus 7 local helpers; filter-chip and empty-state rendering belong in `components/` |
| `app/jobs/[slug]/page.tsx` | 675 | Borderline — but `resolveApplyContext:182` is service logic sitting in a page |
| `lib/services/billing.test.ts` | 632 | Justified (webhook fixture table) |
| `app/dashboard/recruiter/jobs/[id]/applications/page.tsx` | 589 | **Refactor candidate** — a single 450-line component body |
| `lib/services/engagement.test.ts` | 566 | Justified |
| `lib/geo/countries.ts` | 565 | Generated reference data; regenerate, do not hand-edit |

### 11.15 ~~The whole public SEO surface soft-404s~~ — **FIXED 2026-09-11**

Found while verifying 11.1 against the real app. `/jobs/<slug>`, `/freelancers/<slug>` and `/companies/<slug>` returned **HTTP 200** with not-found content for every missing, hidden, held, removed or banned entity. Unknown *routes* returned 404 correctly, so this was specific to `notFound()`.

**Cause, proven by controlled experiment rather than inferred:** a `loading.tsx` opens a Suspense boundary, the shell streams, HTTP 200 is committed, and `notFound()` afterwards can no longer change it. Moving `app/loading.tsx` and `app/jobs/loading.tsx` aside and rebuilding turned every one of those routes into a real 404; restoring them brought the 200s back.

Calling `notFound()` from `generateMetadata` instead **does not work** — that was tried and measured, and the status stayed 200.

Why it mattered here specifically: this product's distribution thesis is that job and profile pages are indexable. Google classifies 200-with-error-content as a soft 404 and spends crawl budget re-checking it. `app/sitemap.ts:34` goes to real trouble to keep soft-404s out of the sitemap while the pages themselves were emitting them.

**Fix:** scope the boundaries with route groups, which do not change URLs. `app/jobs/(index)/{page,loading}.tsx` keeps the browse skeleton while leaving `/jobs/[slug]` outside any boundary; the root fallback moved into `(marketing)` and `(auth)`. Every skeleton is preserved. Pinned by `tests/loading-boundaries.test.ts`, which fails with a message naming the fix if a `loading.tsx` reappears above a detail route.

**Known cosmetic residue:** the jobs 404 now shows the site default `<title>` instead of "Job not found". Next discards the page's metadata once the not-found boundary renders, a not-found file cannot export metadata of its own, and a rendered `<title>` does not win against Next's head management. Documented in `app/jobs/[slug]/not-found.tsx`.

### 11.16 Base UI button misuse *(OPEN)*

The dev log is flooded with *"A component that acts as a button expected a native `<button>` because the `nativeButton` prop is true. Rendering a non-`<button>` removes native button semantics, which can impact forms and accessibility."* — raised from `SiteHeader` and `LandingPage`. A real accessibility defect in how `components/ui/button.tsx` is used with `render={}`, not just log noise. Not investigated.

### 11.17 A dev server outlives a database outage *(gotcha, not a bug)*

`lib/db/client.ts` stashes the Prisma client on `globalThis` in development so hot reload does not open a new pool on every edit. The cost: a dev server started while the database was unreachable keeps a dead pool until the **process** restarts — reloading a file is not enough. It presents as intermittent 500s long after the database is back, and it briefly contaminated the verification of 11.1, because the OG route's `.catch(() => null)` makes a dead pool look exactly like the fix working. Restart `next dev`; do not debug the query.

---

## 12. Doc drift

> **Resolved 2026-09-11.** `CLAUDE.md` was rewritten and `README.md` replaced, so the list below is now a **record of what was wrong**, not a live defect list. It is kept because several entries explain *why* a rule reads the way it does, and because the BUILD_PLAN table in §12C is still accurate.
>
> Still live after the rewrite: `BUILD_PLAN.md` itself is unchanged and retains the drift described in §12C, and `AGENTS.md` is still regenerated by `next dev` on every run.

Original assessment, against the pre-rewrite `CLAUDE.md`:

### Wrong

1. **"Next.js 15"** → `next@16.3.1`, React 19.2.8, Prisma 7.9.1, Zod 4.
2. **"Resend + React Email"** → neither `resend` nor `react-email` is a dependency. Resend is reached by raw `fetch`; React Email is explicitly rejected in `lib/email/layout.ts:6-9`.
3. **"Tailwind + shadcn/ui"** → Tailwind **v4** (no config file), and primitives are **Base UI**, not Radix. `components.json` also claims `"iconLibrary": "hugeicons"`, which has zero imports.
4. **"Freelancer verification: Government ID (Persona/Onfido)"** → no vendor, no dependency, no code path that can set the field.
5. **"TRUSTED → Search priority. Discounted rate."** → neither exists. Browse orders by `publishedAt` only; prices have no tier term.
6. **"Team ($249/mo): … company page"** → `companyPage: isRecruiter` for every plan. The deviation is deliberate and documented at `lib/pricing/entitlements.ts:146-154`, which also records it as an open product question.
7. **Pro "search boost, application analytics"** → `searchBoost` is never written in production (§11.5); `applicationAnalytics` has no consumer.
8. **"Hold for human review… when a post or message contains"** → true for jobs, false for messages (§11.2).
9. **"Enforce server-side in the API layer"** → there is no API layer for applying. Enforcement is inside a Prisma transaction under `FOR UPDATE`.
10. **"VERIFIED = … + LinkedIn match"** → only a non-empty string is required; nothing is matched to the company.
11. **The directory layout section is stale** — missing `app/companies/`, `app/report/`, `app/unsubscribe/`, `app/dev/`, `app/admin/metrics/`, `app/api/{cron,stripe}/`, `app/dashboard/{billing,messages,engagements,saved,settings}/`, and 14 `lib/` subdirectories. It also lists an `about` page that does not exist.
12. **"Prisma queries only in `lib/db/`"** → one violation, `lib/services/job-match.ts:3,38`.
13. **"Definition of done: type-checks clean, lint clean"** → nothing gates it; there is no CI.
14. **CLAUDE.md never mentions `proxy.ts`** — Next 16's renamed middleware, and the file doing session refresh plus route guarding.

### Right but misleading

- **"Free tier: 1 active job post"** — the real cap is the stricter of plan and tier; an UNVERIFIED recruiter is capped at 1 even on Team.
- **"Free recruiters must never reach outbound messaging"** — two different gates. `initiateMessages` is **tier**-gated and plan-independent; `canOutreach` rides on `candidateSearch`. Replies deliberately skip the initiate check, so an UNVERIFIED company can answer.
- **"Candidate search is the paid wall"** — the wall buys *query, reach and outreach*, not data. The public `/freelancers` directory exposes nearly the same fields, and `/freelancers/[slug]` exposes strictly more, ungated. That is intentional (profiles are SEO surface), but "the paid wall" should not be read as "private data".
- **"Add a test for every rule you touch"** — the load-bearing transactions are always mocked (§10).

### BUILD_PLAN.md

| Phase | Status |
|---|---|
| 0.1 / 0.2 | Shipped, over-delivered (138 freelancers vs the 20 asked for) |
| 0.3 | **Partial** — role moved to onboarding (commit `9bcfc5a`); "CI passes" never shipped |
| 1.1 | Shipped; the "multi-step form" is one form of hidden fieldsets |
| 1.2, 1.3, 2.1–2.3, 3.2, 3.3, 4.2–4.4, 5.1–5.3, 6.2, 7.2 | Shipped as specified |
| 3.1 | Shipped, relocated — enforcement is in the DB transaction, not the service; the requested concurrent-submission test does not exist |
| 4.1 | Shipped, re-scoped — `VERIFIED → TRUSTED` only, and the code says so |
| 6.1 | **Partial** — search and the gate ship; the `searchBoost` ranking is inert |
| 7.1 | **Partial** — Resend yes, React Email no; only the digest has an unsubscribe link |
| 7.3 | **Partial** — 3 of 17 action files have no rate limit; **Sentry not wired** |

Shipped outside any named phase: account deletion, engagements dashboard, reports, saved jobs.

### README.md and AGENTS.md

**`README.md` is the untouched `create-next-app` template.** It tells a newcomer to edit `app/page.tsx` and claims the project uses Geist (it loads Archivo, Inter and IBM Plex Mono). It documents no setup, env, migration, seed, `dev-auth-users`, Stripe-CLI or shadow-DB step. It is worse than nothing for onboarding a human.

**`AGENTS.md`** is a 9-line auto-generated `<!-- BEGIN:nextjs-agent-rules -->` block written by `next dev`. It contains no project rules and will be rewritten on every dev run — do not put anything there.

---

## 13. Open questions for the product owner

Ordered by how much they would change the code.

1. **The job OG image leak (§11.1)** — confirm this should be closed, and that PNG previews of `DRAFT`/`PENDING_REVIEW`/`REMOVED` jobs were never intended.
2. **Messages: hold or flag?** (§11.2) — the code deliberately delivers then flags, CLAUDE.md says hold. Change the code or the rule.
3. **`searchBoost` is sold but never written** (§11.5) — is this a missing webhook write, or should the entitlement be withdrawn from the pricing page?
4. **Freelancer ID verification** (§11.6) — Persona/Onfido is a new dependency, which CLAUDE.md forbids without asking. Do you want it, and which vendor?
5. **`companyPage` on every plan** — the code deviates from CLAUDE.md deliberately and asks, at `lib/pricing/entitlements.ts:148-154`, what Team's company page should add *on top of* the free one. That increment becomes its own field and its own gate.
6. **`exportCandidates`, `applicationAnalytics`, `seats: 5`** (§11.7) — build them, or stop advertising them?
7. **Should freelancers be able to withdraw an application** (§11.8), and if so does it refund quota? (Currently it cannot and would not.)
8. **Company description is unscanned** (§11.3) — scan on write like jobs, or accept the hole?
9. **Digest emails carry no tier label** (§11.4) — add it, or narrow the CLAUDE.md rule to on-site surfaces?
10. **Is there a staging environment?** The local `.env` points at a Supabase project that no longer resolves, and the 16 `verify-*.ts` scripts mutate whatever database they are pointed at.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Early access** | The `EARLY_ACCESS_HOURS = 6` window after publication during which a job is visible only to `FREELANCER_PRO`. Implemented as a `publishedAt <= cutoff` query filter in five places, never a cron. |
| **Entitlements** | The pure capability object from `getEntitlements({role, plan, recruiterTier})`. The stricter of plan and tier always wins. |
| **Band** | A purchasing-power price tier — `STANDARD`, `MID`, `LOW` — resolved from `User.billingCountry`. |
| **Standing** | A recruiter's current plan + tier + ban state, read from the DB (`recruiterStanding`, `getEntitlementContext`) and never from the request. |
| **Slot** | One unit of a recruiter's active-post cap. Occupied by an `ACTIVE` **or** `PENDING_REVIEW` job. |
| **Held** | A job the safety scanner sent to `PENDING_REVIEW` at publish time. It has no `publishedAt`, so it is invisible everywhere, but it still holds a slot. |
| **Tier** | *Recruiter verification* tier: `UNVERIFIED` / `VERIFIED` / `TRUSTED`. Distinct from **plan** (what they pay for). Two different words, two different gates — do not conflate them. |
| **Engagement** | A mutually-confirmed record that two parties worked together, with stated rate and duration. The precondition for reviews. |
| **Notice** | A short opaque code passed on `?notice=` and turned into copy by a segment's `notices.ts`. Never free text. |
| **Notices pattern** | See §8.1 — the house convention for how a Server Action reports an outcome. |
| **Standing / verify script** | `prisma/verify-*.ts` — a hand-rolled integration check that runs against a real seeded database and is not wired into npm. |
| **Fails open / fails closed** | Rate limiting fails **open** (an error allows the request). Every authorization rule fails **closed**. |
