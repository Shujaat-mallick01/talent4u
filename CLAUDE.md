# CLAUDE.md — Talent4u

Loaded into every session. Read it fully before making changes.
Architecture detail, traced flows, health and risk: **`docs/ai/PROJECT_CONTEXT.md`**.
Roadmap: **`docs/BUILD_PLAN.md`** (v2). Gap map: **`docs/AUDIT.md`**.
**Read `docs/PROGRESS.md` at the start of every session** — it is the only memory between them.

---

## What we are building

A **commission-free hiring marketplace**. Recruiters post jobs, freelancers apply. We take **0% of anyone's earnings**. We do not hold, escrow, or transmit money between users. Revenue comes from subscriptions only.

Tagline: "0% commission. You keep 100% of what you earn."

**Never** write copy claiming income is "tax free." That is legally indefensible.

### What we do
Matching, verification, reputation, discovery.

### What we explicitly do NOT do
- Hold or transfer user funds
- Arbitrate contract disputes
- Enforce anti-circumvention (users may freely exchange contact info — this is a feature)
- Guarantee job or payment outcomes

---

## Non-negotiable business rules

Product invariants. Do not change them without an explicit instruction that names the rule.
`lib/pricing/gate-audit.test.ts` pins this whole matrix — if you change a gate, that file tells you what you broke.

### Freelancers
- Browsing jobs is **always free and unlimited**, including for logged-out visitors. Job pages are SEO surface — never gate them.
- Free tier: **12 applications per rolling 30 days**. Enforced inside a Prisma transaction under `SELECT … FOR UPDATE` (`lib/db/application.ts:65,86`), never only in the UI. Withdrawal does not refund quota.
- Pro ($6/mo, regionally priced): unlimited applications, 6-hour early access, search boost, application analytics.
- **Early access:** a job is invisible to non-Pro *and logged-out* viewers for `EARLY_ACCESS_HOURS` (6) after publication. A query filter, never a cron — and it must be applied in **all six** places: browse, detail, apply, sitemap, digest, and the job OG image.

### Recruiters
- Free: **1 active job post**, receives applications, basic messaging. No candidate search.
- Growth ($79/mo): 5 active posts, candidate search, filters, pipelines, notes.
- Team ($249/mo): unlimited posts, 5 seats, export.
- **Candidate search is the paid wall.** Free recruiters never reach search, filters, or outbound messaging — not even partial results.
- The effective post cap is the **stricter of plan and tier**: an UNVERIFIED company gets 1 post even on Team.

### Plan vs tier — two different words, two different gates
**Plan** is what they pay for. **Tier** is what we have verified. Never conflate them.
`initiateMessages` is gated by **tier** and is plan-independent. `candidateSearch` is the money gate.

### Regional pricing
Prices are per purchasing-power band, resolved from `User.billingCountry`. **Never hardcode a USD amount outside `lib/pricing/prices.ts`** — that file holds the only amounts in the repo.

---

## Trust model (this determines whether the product survives)

We hold no payment data, so we cannot verify that work happened. We verify everything around it instead.

### Recruiter verification tiers
| Tier | Requirements | Effect |
|---|---|---|
| `UNVERIFIED` | email only | Post labeled "Unverified" in muted grey. Max 1 post. Cannot initiate messages. |
| `VERIFIED` | business-domain email + company reg. number + LinkedIn URL | Blue badge. Full access. Admin approves by hand. |
| `TRUSTED` | VERIFIED + 3 distinct confirmed engagements | Gold badge. Auto-promoted from VERIFIED only. |

Tier labels must be visible on every job card and job detail page. Never hide an unverified label to make the UI cleaner.

### Freelancer verification
Work-link review only (GitHub / portfolio / LinkedIn), approved by an admin.
**There is no ID vendor and no dependency may be added for one without asking** — so `ID_VERIFIED` is currently unreachable in production.

### Mutual engagement confirmation
Reviews are locked until **both** parties confirm they worked together, with stated rate and duration. Enforced in the service layer *and* by a composite FK, two CHECKs and a trigger. Never allow one-sided reviews.

### Automated safety flags
`lib/services/safety.ts`; terms are config in `lib/config/safety-terms.ts`. Triggers: upfront-payment language, unpaid test tasks estimated above 4 hours, off-platform payment handles paired with payment requests.

- **Jobs are held**: scanned inside the publish transaction → `PENDING_REVIEW`, no `publishedAt`, `SafetyFlag` row.
- **Messages are delivered, then flagged** — a deliberate deviation, documented at `lib/services/message-safety.ts:8-16`.
- **Profile prose is refused on write** — company description and freelancer bio, at edit *and* onboarding (`lib/services/profile-safety.ts`). A third shape, because a profile has no `PENDING_REVIEW` to be held in.
- Negation only rescues unpaid-test mentions, within 4 tokens. `UPFRONT_PAYMENT` terms flag unconditionally.

There is a public `/removed-employers` page, populated by `isBanned`. Transparency here is a marketing asset.

---

## Versions

Write code for THESE, not for what you remember. All three changed APIs across majors — if
unsure of an API, read `node_modules` or the official docs rather than guessing.

Next.js **16.3.1** · React **19.2.8** · Prisma + @prisma/client **7.9.1** · @supabase/ssr
**0.12.4** · Zod **4** · Tailwind **4** · Vitest **4** · Node **≥20.19**

## Stack

Next.js **16** (App Router) · React 19 · TypeScript strict · **Prisma 7** + `@prisma/adapter-pg` on Supabase Postgres · Supabase Auth (do not build custom auth) · **Tailwind v4** (CSS-first, no config file) + shadcn `base-maia` over **Base UI** (`render={}`, not `asChild`) · Stripe subscriptions only · Resend over raw `fetch` · Vercel. npm. Node ≥20.19.

Do not add dependencies without asking. Do not introduce a queue, cache layer, or microservice.

---

## Commands

```bash
npm run check               # typecheck + lint + unit. Run before finishing any slice.

npm run dev                 # next dev
npm run db:generate         # prisma generate  <- run after ANY pull touching prisma/
npm run typecheck           # tsc --noEmit     (~40s)
npm run lint                # eslint           (~2m)
npm run test:unit           # vitest, "unit" project — mocked db, no network (~20s)
npm run build               # prisma generate && next build  -- NEEDS A REACHABLE DATABASE

npx vitest run --project unit <file>      # one file
npx vitest run --project unit -t "<name>" # one test

# Integration tests: REAL Postgres, and they TRUNCATE. They refuse to run unless
# DATABASE_URL names a test database, so they cannot be pointed at .env by accident.
npm run db:test:up          # throwaway postgres:16 on :55433 (needs Docker)
DATABASE_URL="postgresql://postgres:testpw@localhost:55433/talent4u_test" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:testpw@localhost:55433/talent4u_test" npm run test:int
npm run db:test:down

npm run db:deploy           # migrations, no shadow DB needed
npm run db:migrate          # migrate dev -- ALSO needs SHADOW_DATABASE_URL
npm run db:seed && npx tsx prisma/dev-auth-users.ts   # BOTH -- seeded users cannot sign in without the second
```

**CI runs all of it** on every push and PR (`.github/workflows/ci.yml`): generate →
migrate → typecheck → lint → unit → integration → build, against a Postgres service.


---

## Two test projects, and why

`unit` mocks `lib/db` at the module boundary — fast, no database, no network.
`integration` (`tests/integration/`) runs against real Postgres, for rules enforced **in
SQL** that cannot be proven anywhere else: the `SELECT … FOR UPDATE` behind the application
quota and the post cap, the CHECK constraints and trigger behind the review lock, and RLS.

A mocked test cannot prove a row lock even in principle — the race only exists across real
connections. Isolation is by TRUNCATE between files, **not** rolled-back transactions:
nesting the app's `$transaction` inside an outer one makes its row locks mean something
different from production, and two "concurrent" queries on one connection are not
concurrent. Slower, and the only option that means anything here.

## Conventions

**The two that override everything else:** every authorization check happens **server-side** — UI gating is cosmetic only. Server Components by default; `"use client"` only when interactivity requires it (13 of 104 `.tsx` files today). All mutations go through Server Actions. There are four route handlers — auth callback, cron digest, Stripe webhook, and the Team CSV export — and none is a data API; the export answers one content type and returns a file.

The rest differ from what you would write by default:

1. **Server Actions never return copy.** They `redirect(\`${PAGE}?notice=<opaque_code>\`)`, and the segment's `notices.ts` is the only place a code becomes a sentence. Unknown code → `null` (an anti-phishing property, not tidiness).
2. **Exactly two action signatures:** redirect-only `Promise<void>`, or `useActionState` with the invariant state `{ fieldErrors: Record<string,string>; formError: string | null }`. Actions never throw.
3. **Fixed order inside every action:** `requireUser()`/`requireRole()` → `checkRateLimit(bucket, user.id)` → Zod `safeParse` → service.
4. **Layering:** `lib/db` is Prisma-only, no business logic; `lib/services` owns rules and returns `{ok:true,…} | {ok:false, reason:"kebab-case"}`; actions do auth/limit/parse/redirect only. **Server Components may read `lib/db` directly.** Services are for writes and view assembly.
5. **Side effects are injected as parameters** (`publishJobTx({ scan })`, `changePassword(raw, updatePassword)`) so rules stay unit-testable.
6. **Every quota and cap uses `SELECT … FOR UPDATE` inside `$transaction`**, plus conditional `updateMany` where the WHERE clause *is* the lock. Copy this; don't invent a new pattern.
7. **No cache invalidation exists.** `revalidatePath`/`revalidateTag`/`router.refresh` appear nowhere — the redirect is the refresh. Only two `unstable_cache` calls in the repo.
8. **Rate limiting fails OPEN. Every authorization rule fails CLOSED.** Do not "fix" the former.
9. **Zod v4**: read `parsed.error.issues`, never `.flatten()`/`treeifyError`. Schemas live in `lib/validations/<domain>.ts`. Query-param parsers are forgiving — drop invalid values, never 400.
10. **Services are `<verb><Noun>ForUser(userId, …)`** — `userId` first, always from the guard, never from the form.
11. **Styling:** use the `globals.css` vocabulary (`.t-heading`, `.t-body`, `.surface-card`, `.chip*`), not ad-hoc utilities. Status colours flip per theme, so **never add `dark:` variants**. Icons are hand-drawn SVG in `components/ui/icon.tsx` — do not import `@hugeicons` even though it is installed.
12. **Comments argue *why*, including what was rejected.** Matching that register is part of the convention.

---

### Mandated by BUILD_PLAN v2 but NOT YET BUILT

Do not import these — they do not exist. Listed so a session recognises the gap rather than
assuming the rule is already satisfied. See `docs/AUDIT.md` §6.

- `lib/clock` — services still call `new Date()` directly in `lib/db/`. The *pure* layer
  already takes `now` as a parameter, which is why the time-based rules are testable.
- `lib/errors` — deliberately **not** adopted; result unions stay. See `docs/DECISIONS.md`.
- `visibleJobsWhere()` — visibility currently lives in two agreeing functions,
  `buildJobBrowseWhere` and `decideJobVisibility`. Consolidating is worth doing: the OG
  image leak was exactly a caller that used neither.
- `requireCompanyMember()` — there is no Company entity and no seats. TEAM advertises 5.
- `npm run check`, `test:unit`, `test:int`, `test:e2e` — none of these scripts exist.
- `tests/factories/`, `tests/invariants/`, `tests/authz/matrix.test.ts` — none exist.

## Gotchas

- **A failing `npm run typecheck` is usually a stale generated client.** `lib/generated/prisma` is gitignored; run `npm run db:generate` before believing a type error.
- **`proxy.ts` is Next 16's renamed middleware, and it is NOT load-bearing.** Every guard re-runs server-side. Never treat the proxy as the gate.
- **Prisma 7:** no `datasource.directUrl`; `prisma.config.ts` owns the datasource and the seed command (`package.json`'s `prisma.seed` is no longer honoured).
- **Deliberate schema drift is a rule here.** CHECKs, the `engagement_sync_confirmation_trg` trigger, the generated `searchVector` column, four party-binding FKs on `Review` and a partial index exist **only in SQL**. `prisma migrate dev` will propose dropping them — **delete those DROPs by hand and say so in the migration header**, as every existing migration does.
- **Never modify `prisma/schema.prisma` without generating a migration** and telling me what it changes.
- Session reads are React-`cache()`d per request. An action that mutates then re-reads must use `getUserAuthStateFresh`.
- **Never add a `loading.tsx` above a public detail route.** It opens a Suspense boundary, the shell streams, HTTP 200 is committed, and `notFound()` then returns a soft 404 on the SEO surface. Scoped with route groups — `app/jobs/(index)/`, `(marketing)`, `(auth)`. Pinned by `tests/loading-boundaries.test.ts`.
- `.measure` is a half-finished removal (still in `globals.css` and 11 files), not a rule.

---

## Do not touch without asking

- `lib/generated/prisma/**` — build output; regenerate, never edit.
- `lib/geo/countries.ts` — generated reference data.
- `AGENTS.md` — rewritten by `next dev` on every run.
- `prisma/verify-*.ts` — they mutate a **real** database. Never run one without knowing which database `.env` points at.
- Existing migration SQL — append a new migration instead.

---

## How to work in this repo

1. **One vertical slice per session.** Model → service → API → UI → test. End committed and deployable.
2. Write the Zod schema and the service function before the UI.
3. Add a test for every rule in "Non-negotiable business rules" that you touch.
4. If a request conflicts with a rule in this file, say so before implementing.

## Session protocol

1. Read this file and `docs/PROGRESS.md`.
2. Plan first — files, schema changes, tests, open questions. Wait for approval before code.
3. Write tests for the acceptance criteria first, and show them failing.
4. Implement until they pass. Stay inside the slice: no unrelated refactors, no new
   dependencies without asking.
5. Everything green (below).
6. Update `docs/PROGRESS.md` (built, verified, knowingly undone) and `docs/DECISIONS.md`
   (any design choice a later session might undo without knowing why).
7. Finish with a table: acceptance criterion → where it is met → which test proves it.

## Never

- Weaken, skip or delete a test to make it pass. If a test looks wrong, stop and explain.
- Gate a paid feature only in the UI.
- Accept role, plan, verification status or ownership from client input.
- Run migrations or a scale seed against production.
- Mark a slice done with failing checks.
- Add a `loading.tsx` above a public detail route — it costs that route its 404 status.
- **Create a table without `ENABLE ROW LEVEL SECURITY` in the same migration.** Supabase
  grants `anon` and `authenticated` full DML on everything in `public` by default and
  serves it over PostgREST, so a table without RLS is readable *and writable* by anyone
  holding the publishable key — which ships in every browser bundle. That is how every
  gate in this product was bypassable until 2026-09-12. Default privileges are now
  revoked, but RLS on the table itself is the part that must not be forgotten.
- Write an RLS **policy** without a reason. The policy set is deliberately empty: the app
  reads as `postgres` (BYPASSRLS), and the browser's Supabase client is for auth only. A
  "public read" policy on a public table re-opens the direct path for nothing. See
  `docs/DECISIONS.md`.

## Definition of done

- `npm run db:generate` current, then `npm run typecheck` clean and `npm run lint` clean
- `npm test` green — all of it
- **Never hardcode a date in a fixture** that flows into code reading the real clock; use an offset from `Date.now()`. One absolute date silently turned the suite red on the day it passed.
- Server-side auth check on every mutation; Zod validation on every input
- Tests for any tier/quota logic touched
- Works logged-out where it should be public
