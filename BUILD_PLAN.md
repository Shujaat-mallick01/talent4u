# Talent4u — Build Plan for Claude Code

Work through these in order. **Each phase ends in a deployable, committed state.** Do not start a phase before the previous one is merged and working.

The prompts below are starting points — paste one, then iterate conversationally within that session. Start a fresh session per slice so context stays clean.

---

## Phase 0 — Foundation (week 1)

**Goal:** empty app that boots, authenticates, and has the full schema migrated.

### Setup, done by hand first
```bash
npx create-next-app@latest talent4u --typescript --tailwind --app --eslint
cd talent4u
npx shadcn@latest init
npm i @prisma/client @supabase/supabase-js @supabase/ssr zod
npm i -D prisma
npx prisma init
git init && git add -A && git commit -m "init"
```

Then drop `CLAUDE.md` in the repo root and `schema.prisma` into `prisma/`.

### Session 0.1
> Read CLAUDE.md. Review prisma/schema.prisma for correctness and index coverage against the query patterns implied by the business rules — especially the rolling 30-day application quota and the early-access window filter. Flag anything that will be slow or wrong at 100k rows. Don't change anything yet, just report.

### Session 0.2
> Apply the agreed schema fixes, run the initial migration, and create a seed script at `prisma/seed.ts` with: 3 categories (AI/automation, full-stack web, Shopify/e-commerce), ~40 skills, 20 freelancer profiles, 5 recruiters across all three tiers, and 15 jobs in mixed states. Make the seed data realistic — I'll be looking at it constantly.

### Session 0.3
> Set up Supabase Auth with email + Google OAuth. Build signup that captures role (FREELANCER or RECRUITER) at registration, a `lib/auth/` module exposing `requireUser()`, `requireRole(role)`, and `getSession()` for server use, and protected route middleware. Auth checks must be server-side. Add tests.

**Done when:** you can sign up as either role, seed data is in the DB, and CI passes.

---

## Phase 1 — Profiles (weeks 2–3)

### Session 1.1
> Build freelancer onboarding: multi-step form capturing display name, headline, bio, country, timezone, hourly rate, skills (multi-select from Skill table), and profile links. Zod validation in `lib/validations/freelancer.ts`, business logic in `lib/services/freelancer.ts`, Prisma access in `lib/db/freelancer.ts`. Auto-generate a unique slug from display name.

### Session 1.2
> Build recruiter onboarding: company name, domain, registration number, LinkedIn, website, country, description, logo upload to Supabase Storage. New recruiters start at UNVERIFIED per CLAUDE.md.

### Session 1.3
> Build public profile pages at `/freelancers/[slug]` and `/companies/[slug]`. Server Components, fully accessible logged-out, with generateMetadata for SEO and JSON-LD Person/Organization structured data. Show verification badges per the tier table in CLAUDE.md.

---

## Phase 2 — Jobs (weeks 4–5)

### Session 2.1
> Build job posting: form, Zod schema, service, draft/publish flow. Enforce the active-post cap by plan tier server-side — 1 for free recruiters, 5 for Growth, unlimited for Team. Return a clear, typed error when the cap is hit; don't just disable the button.

### Session 2.2
> Build `/jobs` browse: server-rendered, filters for category, skills, engagement type, budget range, remote, and recruiter tier. Cursor pagination. Fully public and indexable. Implement the 6-hour early-access window as a query-level filter — free-tier and logged-out users only see jobs where `publishedAt <= now() - EARLY_ACCESS_HOURS`.

### Session 2.3
> Build `/jobs/[slug]` detail page with generateMetadata, JobPosting JSON-LD, and prominent recruiter tier labeling. Unverified posts must carry a visible "Unverified employer" label — do not soften or hide it.

**Ship this to real users.** Get freelancers browsing before you build anything else.

---

## Phase 3 — Applications (weeks 6–7)

### Session 3.1
> Implement the application quota in `lib/services/applications.ts`: free freelancers get 12 applications per rolling 30 days, Pro is unlimited. Count via the `[freelancerId, createdAt]` index. Enforce in the service layer so it holds regardless of caller. Write thorough tests: at the limit, over the limit, exactly 30 days ago, concurrent submissions.

### Session 3.2
> Build the apply flow: cover letter, proposed rate, one application per job enforced by the unique constraint. Show remaining quota in the UI with an upgrade prompt when low. Handle the over-quota error gracefully.

### Session 3.3
> Build the recruiter application inbox: list per job, status transitions, mark-as-viewed, shortlist/reject. Recruiter notes are Growth-tier and above — gate server-side.

---

## Phase 4 — Trust (weeks 8–9)

### Session 4.1
> Build the recruiter verification flow: domain-email confirmation, registration number capture, LinkedIn URL. Promotes UNVERIFIED → VERIFIED. Add the automatic UNVERIFIED → TRUSTED promotion at 3 confirmed engagements.

### Session 4.2
> Build the automated safety flag scanner in `lib/services/safety.ts`. Scan job descriptions and messages on write for the trigger categories in CLAUDE.md. On match, set job status to PENDING_REVIEW and create a SafetyFlag. Keep the term lists in a config file so I can edit them without touching code.

### Session 4.3
> Build the admin moderation queue at `/admin`: open flags and reports, clear/uphold actions, ban recruiter with reason. Build the public `/removed-employers` page listing upheld bans.

### Session 4.4
> Build mutual engagement confirmation and reviews. Reviews are locked until both parties confirm. Enforce this in the service layer, not just the UI.

---

## Phase 5 — Billing (weeks 10–11)

### Session 5.1
> Build `lib/pricing/` as the single source of truth: plan tiers, feature entitlements, and regional price bands keyed by billing country. No prices hardcoded anywhere else. Expose `getEntitlements(user)` returning a typed capability object.

### Session 5.2
> Integrate Stripe subscriptions — checkout, customer portal, webhooks for created/updated/deleted/payment_failed. Subscriptions only; no Connect, no payouts. Verify webhook signatures. Make webhook handling idempotent.

### Session 5.3
> Replace every ad-hoc tier check across the codebase with `getEntitlements()`. Audit that each one is enforced server-side. Add tests for every gate: application quota, active post cap, candidate search, recruiter notes, early access.

---

## Phase 6 — Candidate search (week 12)

### Session 6.1
> Build recruiter candidate search: full-text on headline and bio via Postgres tsvector, plus filters for skills, country, rate range, verification, availability. Gate the entire route behind Growth tier — free recruiters get an upgrade page, never partial results. Pro freelancers rank above free ones (`searchBoost`).

### Session 6.2
> Build recruiter → freelancer outbound messaging. UNVERIFIED recruiters cannot initiate. Route new messages through the safety scanner.

---

## Phase 7 — Launch prep (weeks 13–14)

### Session 7.1
> Transactional email with Resend + React Email: welcome, new application received, application status changed, verification approved, weekly job digest matched to freelancer skills. All with unsubscribe handling.

### Session 7.2
> Instrument the metrics that matter: % of jobs with 5+ applications in 48h, % of recruiters posting a second job within 60 days, % of freelancers getting a reply in 30 days. Build an internal `/admin/metrics` dashboard. Ignore vanity metrics — do not build a signups counter.

### Session 7.3
> Pre-launch hardening: rate limiting on all mutations, sitemap.xml and robots.txt covering jobs and profiles, OG images, error boundaries, Sentry, a full pass confirming every paid feature is enforced server-side.

---

## Working rules

**Start fresh sessions per slice.** Long sessions drift. When a slice is committed, start over.

**Check work against the invariants.** After anything touching tiers or quotas:
> Verify this against the non-negotiable business rules in CLAUDE.md. List each rule this code touches and show me where it's enforced server-side.

**Never let a paid feature be UI-gated only.** Anyone with curl should hit the same wall as anyone with a browser.

**Commit constantly.** Small commits give you cheap rollback when a session goes sideways.

---

## Reality check before you build

The riskiest assumption in this plan is not technical — it's whether recruiters in your chosen niche will pay $79/mo. Consider spending week 1 on 15 customer conversations instead of code. If eight of them say "yes, I'd pay for that," build with confidence. If two do, change the model before you write 14 weeks of software against it.