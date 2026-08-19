# CLAUDE.md — Talent4u

This file is loaded into every Claude Code session. Read it fully before making changes.

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

These are product invariants. Do not change them without an explicit instruction that names the rule.

### Freelancers
- Browsing jobs is **always free and unlimited**, including for logged-out visitors. Job pages are SEO surface — never gate them.
- Free tier: **12 applications per rolling 30 days**. Enforce server-side in the API layer, never only in the UI.
- Pro tier ($6/mo, regionally priced): unlimited applications, 6-hour early access to new posts, search boost, application analytics.
- The "early access" window means: a job is invisible to free-tier users for `EARLY_ACCESS_HOURS` (default 6) after publication. Implement as a query filter, not a cron job.

### Recruiters
- Free tier: **1 active job post**, receives applications, basic messaging. No candidate search.
- Growth ($79/mo): 5 active posts, candidate search, filters, pipelines, notes.
- Team ($249/mo): unlimited posts, 5 seats, company page, export.
- **Candidate search is the paid wall.** Free recruiters must never reach search, filters, or outbound messaging.

### Regional pricing
Prices are set per purchasing-power band, resolved by billing country. Never hardcode USD amounts in components — read from `pricing` config.

---

## Trust model (this determines whether the product survives)

Because we hold no payment data, we cannot verify that work happened. We verify everything around it instead.

### Recruiter verification tiers
| Tier | Requirements | Effect |
|---|---|---|
| `UNVERIFIED` | email only | Post labeled "Unverified" in muted grey. Max 1 post. Cannot initiate messages. |
| `VERIFIED` | business domain email + company reg. number + LinkedIn match | Blue badge. Full access. |
| `TRUSTED` | VERIFIED + 3 mutually confirmed engagements | Gold badge. Search priority. Discounted rate. |

Tier labels must be visible on every job card and job detail page. Never hide an unverified label to make the UI cleaner.

### Freelancer verification
Government ID (Persona/Onfido) + at least one linked proof of work (GitHub, portfolio domain, Behance, LinkedIn).

### Mutual engagement confirmation
Reviews are locked until **both** parties confirm they worked together, with stated rate and duration. This is our substitute for payment data. Never allow one-sided reviews.

### Automated safety flags
Hold for human review, do not auto-publish, when a post or message contains:
- Upfront payment language: registration fee, security deposit, training fee, equipment purchase, processing fee
- Unpaid test tasks estimated above 4 hours
- Off-platform payment app handles paired with payment requests

There is a public `/removed-employers` page. Transparency here is a marketing asset.

---

## Architecture

- **Next.js 15**, App Router, TypeScript strict mode
- **PostgreSQL** on Supabase; **Prisma** ORM
- **Supabase Auth** (email + OAuth). Do not build custom auth.
- **Tailwind + shadcn/ui**
- **Stripe** — subscriptions only. No Connect, no payouts, no marketplace payments.
- **Resend** + React Email
- **Vercel** deploy

### Conventions
- Server Components by default; `"use client"` only when interactivity requires it
- All mutations through Server Actions or route handlers in `app/api/`
- **Every authorization check happens server-side.** UI gating is cosmetic only.
- Zod schemas for all input validation, colocated in `lib/validations/`
- Business logic lives in `lib/services/`, not in components or route handlers
- Prisma queries only in `lib/db/` — no direct client access from components

### Directory layout
```
app/
  (marketing)/          public landing, pricing, about
  (auth)/               signin, signup, onboarding
  jobs/                 public job browse + detail (SEO critical)
  freelancers/          public profile pages (SEO critical)
  dashboard/
    recruiter/
    freelancer/
  admin/                moderation queue
  api/
lib/
  services/             business logic
  db/                   prisma queries
  validations/          zod schemas
  pricing/              tier + regional price config
components/
prisma/
```

---

## How to work in this repo

1. **One vertical slice per session.** Model → service → API → UI → test. End in a committed, deployable state.
2. **Never modify `prisma/schema.prisma` without generating a migration** and telling me what it changes.
3. Write the Zod schema and service function before the UI.
4. Add a test for every rule in "Non-negotiable business rules" that you touch.
5. If a request conflicts with a rule in this file, say so before implementing.
6. Do not add dependencies without asking. Do not introduce a queue, cache layer, or microservice.

## Definition of done
- Type-checks clean, lint clean
- Server-side auth check present on every mutation
- Zod validation on every input
- Tests for tier/quota logic
- Works logged-out where it should be public