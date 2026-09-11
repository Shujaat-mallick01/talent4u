# Talent4u

A **commission-free hiring marketplace**. Recruiters post jobs, freelancers apply, the two contract directly. We take 0% of anyone's earnings and never touch the money — no escrow, no payouts, no Connect. Revenue is subscriptions only.

Because the platform holds no payment data, it cannot verify that work happened. Everything around it is verified instead: recruiter verification tiers, an automated scam-text scanner, mutually-confirmed engagements as the precondition for reviews, and a public `/removed-employers` page.

- **Product rules and conventions:** [`CLAUDE.md`](./CLAUDE.md) — read this before changing anything.
- **Architecture, traced flows, health and risks:** [`docs/ai/PROJECT_CONTEXT.md`](./docs/ai/PROJECT_CONTEXT.md).
- **Roadmap:** [`BUILD_PLAN.md`](./BUILD_PLAN.md) (parts are out of date — PROJECT_CONTEXT §12 says which).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Prisma 7 + `@prisma/adapter-pg` on Supabase Postgres · Supabase Auth & Storage · Tailwind v4 (CSS-first, no config file) · shadcn `base-maia` over Base UI · Stripe (subscriptions only) · Resend · Vercel.

**Node ≥20.19** (or ≥22.12 / ≥24) — set by Prisma 7, stricter than Next's own floor. Nothing is pinned in the repo. npm.

## Getting started

```bash
npm ci
cp .env.example .env        # then fill it in — see the notes in that file
npm run db:generate         # generates the Prisma client into lib/generated/prisma (gitignored)
npm run db:deploy           # applies the 12 migrations; no shadow database needed
npm run db:seed             # 3 categories, 40 skills, 138 freelancers, 6 recruiters, 15 jobs
npx tsx prisma/dev-auth-users.ts   # REQUIRED: seeded users cannot sign in without this
npm run dev                 # http://localhost:3000
```

`prisma/seed.ts` writes rows to Postgres only. Supabase Auth is a separate system, so `dev-auth-users.ts` creates matching Auth users with the *same* ids and one shared password from `DEV_SEED_PASSWORD`. It refuses to run when `NODE_ENV`/`VERCEL_ENV` is production. Sign in as `admin@talent4u.test` for the moderation queue.

### Two connection strings, two consumers

- `DATABASE_URL` — Supabase **transaction pooler**, port 6543. The app at runtime, through the driver adapter.
- `DIRECT_URL` — **session** connection, port 5432. The Prisma CLI only. Migrations cannot run through the pooler: DDL and the migration advisory lock both fail against it.

`npm run db:deploy` needs no shadow database. `npm run db:migrate` (`migrate dev`) additionally needs `SHADOW_DATABASE_URL` pointed at a second Postgres, because Supabase's pooler cannot create the throwaway database Prisma wants.

### Optional services

Everything below is lazy — with none of it set, the app still builds and every public page renders.

- **Stripe** — without `STRIPE_SECRET_KEY` the billing page says so and every button is disabled. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Read the `STRIPE_PRODUCT_*` note in `.env.example`; those three ids are load-bearing, not decoration.
- **Resend** — without `RESEND_API_KEY`, development logs each message to the console; production reports a failure rather than dropping mail silently.
- **Cron** — the weekly digest runs Tuesdays 09:00 UTC via `vercel.json`. By hand: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/job-digest`.

## Commands

```bash
npm run dev          # dev server
npm run build        # prisma generate && next build -- NEEDS A REACHABLE DATABASE (the
                     # landing page is prerendered and reads live counts)
npm start            # serve the build
npm run typecheck    # tsc --noEmit   (~40s)
npm run lint         # eslint         (~2m)
npm test             # vitest run     (~20s)
npm run test:watch
npm run db:studio    # Prisma Studio
```

One test file: `npx vitest run lib/services/application.test.ts`. One test by name: `npx vitest run -t "<name>"`.

**If `npm run typecheck` reports dozens of errors about fields that obviously exist, run `npm run db:generate`.** `lib/generated/prisma` is gitignored build output and goes stale against migrations; that is almost always the cause rather than a real type error.

## Testing

Unit tests only — 51 files, ~880 cases, Vitest on the node environment. The database is **mocked at the module boundary** (`vi.mock("@/lib/db/<domain>")`), never faked and never real, so Prisma never loads. There are no component, route-handler or Server Action tests.

Real integration coverage lives in 16 `prisma/verify-*.ts` scripts. They run against a **real, seeded database**, mutate rows and restore them, and are not wired into npm — each file's header gives its command, e.g. `npx tsx prisma/verify-entitlements.ts`. Three of them (`verify-ui`, `verify-billing-page`, `verify-webhook`) also need the dev server running. Nothing stops one being pointed at production, so check which database `.env` names before running any of them.

**There is no CI.** No workflows, no hooks. `typecheck`, `lint` and `test` are enforced by convention only.

## Layout

```
app/            routes. (marketing) (auth) jobs/ freelancers/ companies/ dashboard/ admin/
                api/ has exactly three route handlers: auth callback, cron digest, Stripe webhook
lib/db/         Prisma access only, no business logic
lib/services/   business logic; returns {ok:true,…} | {ok:false, reason:"…"}
lib/validations/ Zod schemas
lib/pricing/    plans, bands, prices, entitlements — the only place USD amounts live
prisma/         schema, 12 migrations, seed, and the verify-*.ts scripts
proxy.ts        Next 16's renamed middleware. Session refresh only — NOT a security boundary;
                every guard re-runs server-side
```
