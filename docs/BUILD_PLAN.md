# Talent4u — Build Plan v2 (for Claude Code)

This version fixes the three things that most often make Claude Code drift from a plan: prompts without acceptance criteria, tests treated as an afterthought, and business rules built in whatever order features happen to arrive. Every session now has a scope and a definition of done, every phase ends in a test gate, and the entitlement system exists from day one instead of being retrofitted during billing.

Sessions marked **(NEW)** weren't in v1. Sessions marked **(MOVED)** existed but were in the wrong place. Appendix C lists every added feature with a priority, so you can cut P1/P2 items if time is tight.

From scratch this is roughly 18 weeks, up from 14 — the difference is testing and launch-critical features v1 left out. Because much of your code already exists, start with Phase R; it should compress Phases 0–3 considerably.

---

## How to use this plan

1. **Update CLAUDE.md first.** Merge Appendix B into it. The session protocol lives there, so the prompts below stay short. Every prompt implicitly ends with *"Follow the session protocol in CLAUDE.md."*
2. **Put this file in the repo** at `docs/BUILD_PLAN.md` so Claude Code can read it, and create `docs/PROGRESS.md` and `docs/DECISIONS.md`. PROGRESS.md is the only memory between sessions — if it isn't written there, the next session doesn't know it happened.
3. **One slice per fresh session.** Start in plan mode (Shift+Tab), approve the plan, let it build, review the diff, commit.
4. **Every phase ends in a test gate.** Don't start the next phase until the gate is green and merged.
5. **One-time Claude Code setup:**
   - `.claude/commands/test-gate.md` containing the test gate prompt from Appendix A, so you run `/test-gate 3` instead of pasting it.
   - `.claude/agents/security-reviewer.md` — a subagent whose only job is reviewing a diff for missing auth, ownership, and entitlement checks. Invoke it at the end of any slice that touches tiers, quotas, or other users' data.
   - A Stop hook in `.claude/settings.json` that runs `npm run typecheck && npm run test:unit` whenever Claude finishes a turn, so broken code is caught before you review it.

---

## If you already built with v1: Phase R — Recovery

Don't restart. Audit what exists, put tests around it, and let the failures tell you what to fix. Then resume at the earliest phase the audit marks incomplete, running each earlier phase's test gate against the existing code before building anything new.

### Session R.1 — Audit (report only)
```text
Read CLAUDE.md, docs/BUILD_PLAN.md, and the whole codebase. Write docs/AUDIT.md with:

1. For every session in BUILD_PLAN.md: done / partial / missing / diverged, with file paths.
2. For every business rule in CLAUDE.md: where it is enforced (file:line), whether that
   enforcement is in the service layer or only in UI/middleware, and which test covers it
   (or "none").
3. Security findings:
   - server actions and route handlers without an auth check
   - queries that take an ID from the client without an ownership check
   - role, plan, or verification status accepted from client input
   - Supabase tables readable or writable with the public anon key
4. Every use of new Date(), Date.now(), or SQL now() inside business logic.
5. Existing tests: what each actually asserts, and any that mock the thing they claim to test.

Rank findings: security > broken business rule > missing feature > code quality.
Change no code.
```

### Session R.2 — Test harness
Run Session 0.3 against the existing code.

### Session R.3 — Invariant tests on existing code
```text
Using docs/AUDIT.md, write integration tests for every business rule in CLAUDE.md against
the current code, one file per rule area under tests/invariants/. Also create
tests/authz/matrix.test.ts using the actor list in Appendix A of BUILD_PLAN.md, covering
every action that exists today.

Do NOT fix any code. Run the suite and give me the failing tests grouped by root cause.
Those failures are the fix list.
```

### Session R.4+ — Fix
One session per failure group, security first:
> Make the tests in [group] pass without modifying the tests. If you believe a test is wrong, stop and explain why before changing anything.

---

## Phase 0 — Foundation (weeks 1–2)

**Goal:** the app boots, auth works, the schema is migrated, tests and CI run on every PR, and the entitlement, clock, and error primitives exist.

### Setup, done by hand
```bash
npx create-next-app@latest talent4u --typescript --tailwind --app --eslint
cd talent4u
npx shadcn@latest init
npm i @prisma/client @supabase/supabase-js @supabase/ssr zod
npm i -D prisma
npx prisma init
mkdir docs && touch docs/PROGRESS.md docs/DECISIONS.md
git add -A && git commit -m "init"
```

Then add `CLAUDE.md` (with Appendix B merged in), `prisma/schema.prisma`, and this file as `docs/BUILD_PLAN.md`. Write the installed major versions of Next.js, Prisma, and `@supabase/ssr` into CLAUDE.md — all three have changed APIs across major versions, and without this Claude Code will sometimes write code for an older one.

### Session 0.1 — Schema review (report only)
```text
Read CLAUDE.md. Review prisma/schema.prisma for correctness and index coverage against the
query patterns the business rules imply: the rolling 30-day application quota, the
early-access window, /jobs filters with cursor pagination, and candidate search.
Flag anything slow or wrong at 100k rows.

Also check the schema supports the following, and propose additions where it doesn't:
- Company as its own entity with recruiter memberships (OWNER, MEMBER). Plan,
  verification status, and jobs belong to the company. The TEAM plan needs seats.
- An ADMIN role that can never be self-assigned.
- Job lifecycle: DRAFT, PENDING_REVIEW, PUBLISHED, PAUSED, CLOSED, FILLED, EXPIRED,
  REMOVED — with publishedAt, expiresAt, closedAt.
- Money as integer minor units plus a currency code (hourly rates, budgets).
- Application.firstResponseAt, withdrawnAt, and a status enum with explicit transitions.
- Message threads linked to either an application or an outreach.
- Report (user-submitted), SafetyFlag, AuditLog, StripeEvent (webhook idempotency),
  Subscription, Notification, SavedJob, SavedSearch, ScreeningQuestion.
- Freelancer availability status and portfolio items.
- Soft delete / anonymization for account deletion; terms-acceptance version and time.
- Slug history so renamed profiles and jobs can redirect.

Report only. Change nothing.
```

### Session 0.2 — Migration, seed, factories
```text
Apply the schema changes we agreed and run the initial migration.

Create prisma/seed.ts: 3 categories (AI/automation, full-stack web, Shopify/e-commerce),
~40 skills, 20 freelancers (mixed FREE/PRO, countries, timezones, rates, availability),
5 companies covering all three recruiter plans and all verification states, and 15 jobs
covering every status — including 2 published within the last 6 hours (so the early-access
window is visible) and 1 expired. Make it realistic; I'll look at it constantly.

Separately:
- tests/factories/: typed builders (buildFreelancer, buildCompany, buildJob,
  buildApplication, ...). Tests must never depend on seed data.
- scripts/seed-scale.ts: 100k jobs, 50k freelancers, 300k applications for performance
  testing. It must refuse to run against production.
```

### Session 0.3 — Test harness and CI (NEW)
```text
Set up the test infrastructure described in Appendix A of docs/BUILD_PLAN.md:

- Vitest with two projects: "unit" (no DB, no network) and "integration" (real Postgres).
- Test database: local Supabase via the Supabase CLI, so integration tests exercise real
  Postgres, Auth, and Storage. Tests refuse to run unless DATABASE_URL points at the test
  database. Isolate tests by truncation between files or rolled-back transactions — pick
  one and explain the trade-off.
- Playwright with @axe-core/playwright; projects for desktop Chrome and a mobile viewport.
  Pre-authenticated storage states for each test actor (email/password users — never
  Google OAuth in tests).
- npm scripts: typecheck, lint, test:unit, test:int, test:e2e, and check
  (typecheck + lint + unit + integration).
- GitHub Actions on every PR: typecheck, lint, unit, integration, then E2E against a
  production build. Merging is blocked unless green.
- Coverage for lib/services, lib/pricing, lib/auth with an 85% line threshold on those
  folders only. No threshold on UI code.

Prove the pipeline with one trivial test per layer. Document every command in CLAUDE.md.
```

### Session 0.4 — Auth
```text
Set up Supabase Auth with email/password and Google OAuth.

- Role (FREELANCER or RECRUITER) is chosen at signup. OAuth can't carry a role, so new
  Google users land on /onboarding/role before anything else.
- The role is validated server-side against that two-value allowlist. ADMIN can never come
  from client input; admins are set by a script or by another admin.
- Every Supabase auth user gets a matching User row. Tell me which mechanism you chose
  (DB trigger vs. auth callback) and how it recovers if it fails halfway.
- Email verification is required before posting, applying, or messaging.
- lib/auth/ exposes getSession(), requireUser(), requireRole(role), requireAdmin(), and
  requireCompanyMember(companyId).
- Middleware (or proxy, depending on Next.js version) only redirects for UX. Every server
  action, route handler, and service re-checks auth, because server actions are public
  HTTP endpoints.
- Lock down Supabase: enable RLS on every table in any exposed schema with no permissive
  policies (or stop exposing the schema), so the anon key shipped to the browser can't read
  or write anything directly. Prisma is the only data path.
- Bot protection (Cloudflare Turnstile or similar) on signup.

Tests:
- Integration tests for each lib/auth helper.
- A test that uses the anon key to query every table and expects denial.
- Submitting role=ADMIN (or any unknown role) at signup fails.
- Calling a protected server action with no session returns Unauthenticated, not data.
- Playwright: email signup as each role; a role-less OAuth user (created via the admin
  API) is forced to /onboarding/role.
```

### Session 0.5 — Entitlements, clock, errors (MOVED from Phase 5)
```text
Build the primitives every later feature depends on.

- lib/pricing/: plan tiers (freelancer FREE, PRO; company FREE, GROWTH, TEAM), feature
  entitlements, limits, and stub prices — the single source of truth.
  getEntitlements(actor) returns a typed capability object: applicationQuota,
  hasEarlyAccess, searchBoost, activePostCap, canSearchCandidates, canUseNotes,
  canInitiateOutreach, seats, and so on. Stripe arrives in Phase 5 and will only update
  the stored plan; nothing in this module changes then.
- An admin-only action to set a user's or company's plan manually (testing, comps, support).
- lib/clock.ts: an injectable clock. Services take `now` from it. No new Date() in
  services and no SQL now() in business-rule queries — compute cutoffs in code and pass
  them as parameters.
- lib/errors.ts: typed domain errors (Unauthenticated, Forbidden, NotFound, NotEntitled,
  QuotaExceeded, PostCapReached, AlreadyApplied, InvalidTransition, ValidationFailed)
  with one mapping to HTTP status codes and user-facing messages.
- A CI check that fails if a plan name is compared anywhere outside lib/pricing
  (e.g. plan === "GROWTH" in a component or service).

Tests: unit-test every entitlement for every plan, and prove the CI check catches a
violation.
```

### Test Gate 0
Run `/test-gate 0`. Then by hand: sign up as both roles with email and Google, try to open `/admin` as each, and confirm in the Supabase dashboard that RLS is on for every table.

**Done when:** a fresh clone can migrate, seed, and pass `npm run check` using only the commands in CLAUDE.md; CI is green; the authz matrix exists.

---

## Phase 1 — Profiles (weeks 3–4)

### Session 1.1 — Freelancer onboarding
```text
Build freelancer onboarding: a multi-step form for display name, headline, bio, country,
timezone, hourly rate (minor units + currency), availability (AVAILABLE / OPEN /
NOT_AVAILABLE), skills (multi-select from Skill, max 15), and profile links (validated
URLs). Zod in lib/validations/freelancer.ts, logic in lib/services/freelancer.ts, Prisma
in lib/db/freelancer.ts.

- Unique, collision-safe slug from display name; renames keep the old slug as a redirect.
- Progress survives a refresh. The same Zod schema validates on client and server.
- Expose isProfileComplete(); the applications service will require it.

Tests: slug generation (unit: unicode, emoji, collisions, reserved words like "admin");
service integration tests; IDOR — updating another freelancer's profile via a direct
server-action call returns Forbidden; Playwright happy path.
```

### Session 1.2 — Portfolio (NEW)
```text
Add portfolio items to freelancer profiles: title, description, link, optional image.
Up to 6, reorderable. Images go to Supabase Storage with server-side MIME and size
validation, EXIF stripped, and bucket policies so users can only write under their own
path. Reject SVG uploads.

Tests: ownership (IDOR), item limit, upload validation (wrong MIME, oversized, SVG).
```

### Session 1.3 — Companies and recruiter onboarding
```text
Build recruiter onboarding around the Company entity. A recruiter creates a company
(name, domain, registration number, LinkedIn, website, country, description, logo upload
to Supabase Storage) and becomes its OWNER. Companies start UNVERIFIED per CLAUDE.md.

- Plan and verification status live on the company. Every recruiter-side permission check
  goes through requireCompanyMember() — no inline membership queries.
- TEAM plan: owners invite members by email (single-use token, 7-day expiry, accept flow).
  Seat count comes from getEntitlements(). Owners can remove members.
- Same upload rules as portfolio images.

Tests: a member of company A can't read or change anything of company B; seat cap;
invite reuse and expiry; a non-owner can't invite or remove.
```

### Session 1.4 — Public profiles
```text
Build /freelancers/[slug] and /companies/[slug]: Server Components, fully accessible
logged-out, generateMetadata, JSON-LD Person / Organization, and verification badges per
the tier table in CLAUDE.md.

- Private fields must never reach the client: select only public columns in lib/db;
  don't filter in the component.
- Deleted accounts 404. Banned companies show a removed notice (linking to
  /removed-employers once it exists). Old slugs 301 to the current one.

Tests: assert the public-profile query returns no private fields; Playwright + axe on
both pages; JSON-LD present and well-formed.
```

### Session 1.5 — Account settings, deletion, legal pages (NEW)
```text
Build /settings: change email (with re-verification), change password, notification
preferences (stored now, used from Phase 3), download-my-data (JSON), and account deletion.

- Deletion anonymizes rows other users depend on (applications, messages, reviews show
  "Deleted user"), removes PII everywhere else, cancels any subscription (stub until
  Phase 5), and is audit-logged. A company OWNER must transfer ownership or delete the
  company first.
- Add /terms, /privacy, and /acceptable-use with placeholder text; record the accepted
  terms version and timestamp at signup.

Tests: keep a list of PII columns in code and assert deletion clears every one, so a PII
column added later without deletion handling fails the test.
```

### Test Gate 1
`/test-gate 1`. Journeys to cover in E2E: freelancer signs up → onboards → public profile renders logged-out; recruiter creates a company → uploads a logo → invites a teammate who accepts; a user deletes their account and their profile 404s.

---

## Phase 2 — Jobs and a safe first launch (weeks 5–7)

### Session 2.1 — Job posting
```text
Build job posting: form, Zod schema, service, draft/publish, edit, pause, close, and mark
filled. Recruiters can add up to 3 short screening questions per job. Jobs expire 30 days
after publishing (value in config), with one-click repost.

- The active-post cap comes from getEntitlements() and is enforced in the service on
  publish. It must be race-safe: two concurrent publishes at cap−1 produce exactly one
  success (transaction + row lock on the company).
- Hitting the cap returns PostCapReached with the current count and the limit; the UI
  shows it with an upgrade prompt. Don't just disable the button.
- Only members of the owning company can edit, pause, or close.
- Every create/update calls lib/services/safety.ts (built in 2.2 — use a stub that
  returns clean for now).

Tests: at cap, over cap, concurrent publish at cap−1, closing or expiring frees a slot,
IDOR across companies, direct server-action call as a FREE company over cap.
```

### Session 2.2 — Safety scanner and reporting (MOVED from 4.2, expanded)
```text
Build lib/services/safety.ts. Scan job titles and descriptions on write for the trigger
categories in CLAUDE.md (messages will use it from Phase 3). Term lists live in
config/safety-terms.ts so I can edit them without touching logic.

- Normalize before matching: case, unicode look-alikes, spacing and punctuation tricks
  ("t e l e g r a m", "wh@tsapp"), basic leetspeak.
- On match: job → PENDING_REVIEW, and a SafetyFlag is created with category and matched terms.
- User-facing reports: a Report button on jobs, companies, and freelancer profiles
  (reason + details), rate-limited per user. Three open reports on one job from
  different users move it to PENDING_REVIEW.
- Minimal admin view: list held jobs and open reports; approve or remove.
  (The full moderation console comes in Phase 4.)

Tests: table-driven — per category: plain matches, obfuscated variants, and explicit
false-positive cases (e.g. "Telegraph Avenue" must not match "telegram"); the three-report
auto-hold; admin-only access via direct calls.
```

### Session 2.3 — Browse
```text
Build /jobs: server-rendered, filters for category, skills, engagement type, budget range,
remote, and recruiter tier; cursor pagination; fully public and indexable.

Create ONE visibility function — lib/db/job-visibility.ts → visibleJobsWhere(viewer, now) —
and use it on every surface where a job can appear: browse, detail, apply, sitemap,
alerts, digests, search, and OG images. It encodes:
- only PUBLISHED jobs not past expiresAt
- FREE-tier and logged-out viewers only see jobs where publishedAt <= now − EARLY_ACCESS_HOURS
- PRO freelancers see every published job
- members of the owning company always see their own jobs
`now` comes from lib/clock and is passed in — no SQL now().

Tests: integration tests at the window boundary (5h59m, exactly 6h, 6h01m) for every
viewer type using the injected clock. Then run the browse query against the scale seed and
show me EXPLAIN ANALYZE for the three most common filter combinations.
```

### Session 2.4 — Job detail
```text
Build /jobs/[slug]: generateMetadata, JobPosting JSON-LD (including validThrough and
remote/location type), and prominent recruiter tier labeling. Unverified posts carry a
visible "Unverified employer" label — do not soften or hide it.

- Visibility goes through visibleJobsWhere. A FREE or logged-out viewer opening an
  early-access job's URL sees a teaser (title, company, "open to everyone in 3h 12m —
  Pro members can apply now"), not the description, and the page is noindex until the
  window passes.
- Closed and expired jobs show a closed state and leave the sitemap. Removed jobs 404.

Tests: Playwright for each viewer type on an early-access job; JSON-LD valid; the
unverified label is actually visible (assert visibility, not just DOM presence).
```

### Session 2.5 — Launch minimum (NEW)
```text
Everything needed before real users see the site:

- Sentry on server and client, tagged with user ID (never email).
- Rate limiting on signup, login, job create/publish, and report — per IP and per user —
  returning 429 with Retry-After.
- sitemap.xml and robots.txt for public jobs and profiles, built from visibleJobsWhere as
  a logged-out viewer.
- A scheduled job runner (recommend one of Vercel Cron, Supabase pg_cron, or Inngest and
  explain why). First job: expire jobs past expiresAt. Every scheduled job must be
  idempotent.
- Error boundaries and a not-found page.
- A staging environment with its own database. Production migrations run only from CI.

Tests: 429 behavior; running the expiry job twice gives the same result; the sitemap
excludes early-access, expired, and removed jobs.
```

### Test Gate 2 — then ship
`/test-gate 2`. Journeys to cover in E2E: a company posts a job → a PRO freelancer sees it immediately → a logged-out visitor sees it only after 6h (clock-controlled) → a FREE company hits the cap on its second publish → a job containing an obfuscated Telegram handle lands in PENDING_REVIEW. Load: a k6 smoke test against staging with the scale seed on `/jobs` and `/jobs/[slug]`.

**Ship to real users — browsing only.** Put a "get notified when applications open" capture on job pages so you're building a list while Phase 3 is in progress.

---

## Phase 3 — Applications and the hiring loop (weeks 8–10)

### Session 3.1 — Application quota
```text
Implement the application quota in lib/services/applications.ts: FREE freelancers get 12
applications per rolling 30 days; PRO is unlimited (from getEntitlements). Count via the
[freelancerId, createdAt] index with the cutoff computed from lib/clock. Enforce in the
service so it holds regardless of caller.

- Concurrency: the count and the insert happen in one transaction holding a lock — a row
  lock on the freelancer, or pg_advisory_xact_lock keyed on freelancerId. (Use the
  transaction-scoped variant; session-level advisory locks break behind a
  transaction-mode connection pooler.)
- Withdrawn applications still count toward the quota; otherwise withdraw-and-reapply
  bypasses it. Record this in docs/DECISIONS.md.
- QuotaExceeded includes remaining = 0 and resetsAt.

Tests: 11 used → 12th succeeds; 12 used → 13th fails; oldest application at exactly the
30-day boundary and one second either side; 5 parallel submissions with 11 used →
exactly 1 succeeds (run this test 20× in a loop to prove it isn't flaky); PRO with 500 in
the window succeeds; a downgraded PRO with 20 in the window is blocked until it clears.
```

### Session 3.2 — Apply flow
```text
Build the apply flow: cover letter, proposed rate, answers to screening questions. One
application per job via the unique constraint — map Prisma's unique-violation (P2002) to
AlreadyApplied.

The service also rejects, with typed errors: jobs not visible to this viewer per
visibleJobsWhere (a FREE user can't apply to an early-access job by calling the action
directly), closed/paused/expired jobs, incomplete profiles, unverified emails, and
members of the company that owns the job.

- Freelancers can withdraw an application.
- The UI shows remaining quota and reset date, an upgrade prompt at ≤3 remaining, and a
  clear over-quota state.
- Freelancer dashboard: my applications with status and last update.

Tests: every rejection path via direct service calls; Playwright apply happy path and
over-quota state.
```

### Session 3.3 — Recruiter inbox
```text
Build the recruiter application inbox: per-job list, filter by status, mark-as-viewed,
shortlist, reject (with optional message).

- Status transitions are an explicit state machine in the service; invalid transitions
  throw InvalidTransition.
- Set Application.firstResponseAt on the first recruiter action other than viewing; never
  overwrite it.
- Recruiter notes are GROWTH and above — gated in the service via getEntitlements, not
  just hidden in the UI.
- Only members of the owning company can see a job's applications.

Tests: every valid and invalid transition; IDOR (company B reading company A's
applications by ID); notes as a FREE company via direct call → NotEntitled;
firstResponseAt set exactly once.
```

### Session 3.4 — Application messaging (NEW — v1 only had outbound messages, in Phase 6)
```text
Build message threads attached to applications. A thread opens when the recruiter
shortlists or messages an applicant; after that, both sides can write. Freelancers can't
start threads with recruiters outside an application.

- Every read and write checks thread participation.
- Every message passes through lib/services/safety.ts. A match holds the message for
  review and shows the sender a neutral notice.
- When a message mentions moving off-platform (WhatsApp, Telegram, personal email, phone)
  or any payment, show the recipient an inline safety tip.
- Unread counts. Either side can block the other; blocked users can't message.

Tests: non-participant read/post → Forbidden; held message not delivered; blocked user
can't send; safety tip rendered.
```

### Session 3.5 — Notifications and core email (MOVED from 7.1)
```text
Transactional email with Resend + React Email, plus an in-app notification bell.

- Recruiters: new application (batched — at most one email per job per hour), new message.
- Freelancers: application status changed, new message.
- Everyone: welcome, email verification.
- Respect notification preferences. Every non-essential email has one-click unsubscribe
  (List-Unsubscribe headers) using a token scoped to one user and one category.
- Sending runs in the background job runner, never in the request path, with retries.

Tests: preferences respected; batching; a token can't unsubscribe anyone else; every
template renders (snapshot).
```

### Test Gate 3
`/test-gate 3`. Journeys to cover in E2E — the full loop: a company posts → a FREE freelancer applies → the recruiter gets an email → shortlists → messages → the freelancer replies. Plus quota exhaustion, and a FREE user trying to apply to an early-access job with a direct request.

---

## Phase 4 — Trust (weeks 11–12)

### Session 4.1 — Verification
```text
Build company verification: domain-email confirmation (a code sent to an address at the
company's own domain — reject free-mail and disposable domains), registration number,
and LinkedIn URL. Requests go to an admin queue; approval promotes UNVERIFIED → VERIFIED.

Before building, confirm the promotion rules in CLAUDE.md with me. v1 allowed
UNVERIFIED → TRUSTED directly at 3 confirmed engagements, which would let an employer who
never proved their identity become "Trusted". Recommended: TRUSTED requires VERIFIED first.
Also propose demotion rules (e.g. after an upheld report).
```

### Session 4.2 — Engagements and reviews
```text
Build mutual engagement confirmation from an application (either side proposes, the other
confirms) and reviews. Reviews unlock only when both sides have confirmed — enforced in
the service, not the UI.

- One review per side per engagement; editable for 7 days, then locked. The reviewed
  party can post one public response. Reviews can be reported.
- TRUSTED promotion counts only confirmed engagements with distinct freelancers whose
  accounts are 14+ days old with a verified email. It runs idempotently after each
  confirmation.

Tests: review before mutual confirmation via direct call → Forbidden; duplicate review
rejected; sock-puppet scenario (3 engagements with 2-day-old accounts) doesn't promote;
promotion is idempotent.
```

### Session 4.3 — Moderation console
```text
Build /admin: queues for safety flags, reports (jobs, profiles, messages, reviews), held
messages, and verification requests. Actions: clear, uphold, remove job, ban company with
reason. A ban removes the company's jobs, stops its members posting and messaging, and
flags any active subscription for refund review.

- Every admin action writes an AuditLog row: who, action, target, reason, before/after.
- Public /removed-employers lists upheld bans: company name, date, and a category-level
  reason from a fixed list — no free-text accusations.

Tests: every /admin route and action rejects non-admins via direct call; every action
writes an audit row; the ban cascade works.
```

Before `/removed-employers` goes live, have a lawyer review the wording. Publicly naming companies carries defamation risk, which is why the prompt restricts reasons to a fixed category list.

### Test Gate 4
`/test-gate 4`, then an abuse run in a fresh session:
```text
Act as a scammer against staging, using both the UI and direct HTTP calls. Try to:
post a job with an obfuscated Telegram handle; message a freelancer asking for a
"registration fee"; reach TRUSTED using sock-puppet freelancer accounts; review without a
confirmed engagement; keep posting or messaging after a ban. Report which attempts
succeeded. Write a failing test for each before fixing anything.
```

---

## Phase 5 — Billing (weeks 13–14)

Because entitlements have existed since Phase 0, this phase only connects Stripe to the stored plan. v1's "replace every ad-hoc tier check" session is gone — the CI check from 0.5 prevented those checks from being written.

### Session 5.1 — Stripe subscriptions
```text
Integrate Stripe subscriptions: Checkout, Customer Portal, and webhooks for
checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid,
and invoice.payment_failed. Subscriptions only — no Connect, no payouts.

- Verify signatures. Store every event ID in StripeEvent under a unique constraint and
  skip duplicates.
- Don't trust event order: on any subscription event, fetch the current subscription from
  Stripe and write that state.
- Stripe only updates the stored plan and subscription. Entitlements still come
  exclusively from getEntitlements().
- Freelancer subscriptions attach to the user; company subscriptions attach to the
  company, and only the OWNER can manage billing.

Tests: the same event delivered twice → one state change; "updated" delivered before
"created" → correct final state; bad signature → 400; a non-owner opening the portal →
Forbidden. Document how to run `stripe listen` locally.
```

### Session 5.2 — Plan lifecycle (NEW)
```text
Define what happens on every plan change. Write the rules into CLAUDE.md first and get my
approval, then implement:

- Upgrade: immediate.
- Downgrade or cancel: at period end. A company over its new post cap keeps its most
  recent posts live up to the cap and the rest move to PAUSED (never deleted); the owner
  can choose which stay live. Notes become read-only. Seats beyond the new limit become
  read-only.
- Payment failed: a 7-day grace period with a banner and emails, then downgrade.
- PRO freelancer downgrade: the quota applies immediately to the existing 30-day window.

Tests: every transition with clock-controlled integration tests. On staging, run renewal
and failed-payment scenarios using Stripe test clocks.
```

### Session 5.3 — Regional pricing
```text
Implement regional price bands in lib/pricing keyed by billing country. Show localized
prices on /pricing from an IP-based guess, but ask for billing country before checkout and
pass the matching Price. In the webhook, compare against the card's issuing country; on a
mismatch, flag for review rather than cancelling. Ask me whether to enable Stripe Tax.
```

### Test Gate 5
`/test-gate 5`, with extra focus: every gate in the entitlement table tested at every plan, and again in post-downgrade states.

---

## Phase 6 — Candidate search and outreach (week 15)

### Session 6.1 — Candidate search
```text
Build recruiter candidate search: full-text on headline and bio via a generated Postgres
tsvector column with a GIN index, plus filters for skills, country, rate range,
verification, and availability. PRO freelancers rank above FREE ones (searchBoost).
Exclude deleted, banned, and NOT_AVAILABLE profiles unless a filter includes them.

Gate the whole feature behind canSearchCandidates. FREE companies get an upgrade page —
never partial results — and direct calls to the search action or route return NotEntitled.

Tests: the gate via direct call; ranking order; combined filters. Run against the scale
seed and report EXPLAIN ANALYZE and p95 latency.
```

### Session 6.2 — Outbound messaging
```text
Build recruiter → freelancer outreach using the thread system from 3.4. UNVERIFIED
companies can't initiate (enforced in the service). Add a daily outreach cap per company
by plan (propose numbers). Freelancers can opt out of outreach entirely. All messages go
through the safety scanner.

Tests: UNVERIFIED initiating via direct call → Forbidden; the daily cap; opt-out respected.
```

### Test Gate 6
`/test-gate 6`, plus k6 against staging with the scale seed on search, browse, and apply.

---

## Phase 7 — Retention and metrics (week 16)

### Session 7.1 — Saved jobs, alerts, weekly digest
```text
Freelancers can save jobs and save searches. Saved-search alerts are instant for PRO and
daily for FREE. A weekly digest sends jobs matched to the freelancer's skills. GROWTH+
companies can save candidate searches.

Every alert and digest is built through visibleJobsWhere for that recipient, so FREE users
never receive early-access jobs before the window. Unsubscribe per category.

Tests: a FREE user's alert excludes a 2-hour-old job and includes it after 6h; digest
matching; unsubscribe.
```

### Session 7.2 — Metrics
```text
Build /admin/metrics for the numbers that matter: % of jobs with 5+ applications within 48h
of publishing, % of companies posting a second job within 60 days, % of freelancers getting
a recruiter response within 30 days (from firstResponseAt), and median time to first
response. Compute from existing tables. No signups counter, no vanity metrics.

Add product analytics (e.g. PostHog) for the signup → onboarding → first apply / first
post funnels.
```

### Session 7.3 — User-facing insights (NEW)
```text
Companies: per-job views, applicants, and average response time. Freelancers: profile
views and application outcomes. Propose which insights should be paid-tier perks and ask
me before gating anything.
```

### Test Gate 7
`/test-gate 7`.

---

## Phase 8 — Pre-launch QA (weeks 17–18) (NEW)

A dedicated testing phase. No new features.

### Session 8.1 — Security review
```text
Act as a penetration tester with full access to the codebase. For every server action and
route handler, produce a table: auth check, role check, entitlement check, ownership check,
input validation, rate limit. Flag every gap.

Then, with scripted HTTP calls against staging, attempt: IDOR on every resource with an ID;
role escalation; bypassing every paid gate; early-access leaks on every surface (detail,
sitemap, OG image, alerts, search, JSON-LD); mass assignment (extra fields like plan or
verificationStatus in action payloads); stored XSS in bios, descriptions, and messages;
open redirects in auth callbacks; malicious uploads. Also run npm audit and a secrets scan,
and check security headers (CSP, HSTS, frame-ancestors).

Write a failing test for each finding before fixing it.
```

### Session 8.2 — Performance and load
```text
With the scale seed on staging, run k6 load tests on /jobs with filters, /jobs/[slug],
candidate search, and apply. Targets: p95 < 500ms for reads, < 1s for writes. Turn on
Prisma query logging and find N+1 queries. Check connection pooling settings for
serverless. Report Core Web Vitals for the public pages.
```

### Session 8.3 — Accessibility, SEO, mobile
```text
axe on every page with zero serious or critical violations; a keyboard-only run through
signup, onboarding, apply, and post; a Rich Results check on job pages; sitemap validity;
OG images; the full E2E suite on the mobile viewport.
```

### Session 8.4 — Regression and user acceptance
Run the full E2E suite on staging. Then put 3 recruiters and 5 freelancers through scripted tasks while you watch (screen-share is fine). Log every moment of confusion as an issue — those findings are worth more than any automated test.

### Session 8.5 — Operations readiness
```text
- Verify backups by actually restoring one to a scratch database.
- Alerts for error rate, webhook failures, cron failures, and email bounce rate.
- Runbooks in docs/runbooks/: ban a scammer fast, issue a refund, roll back a migration,
  rotate a leaked key.
```

**Done when:** every finding from 8.1 has a passing test, load targets are met, and you've restored a backup with your own hands.

---

## Working rules

**Fresh session per slice.** `docs/PROGRESS.md` carries memory between sessions; long sessions drift.

**Plan before code.** Reject any plan that touches files outside the slice or adds dependencies you didn't expect.

**Read the test names before the implementation.** If they don't read like business rules ("a free freelancer's 13th application within 30 days is rejected"), the tests are wrong, and the code will be too.

**Check work against the invariants.** After anything touching tiers, quotas, or other users' data:
> Verify this against the non-negotiable business rules in CLAUDE.md. List each rule this code touches, show where it's enforced server-side, and name the test that proves it.

**Never let a paid feature be UI-gated only.** Anyone with curl hits the same wall as anyone with a browser — and the authz matrix proves it.

**When a session goes sideways, reset — don't argue.** Discard the changes and start a fresh session with a narrower prompt.

**Commit constantly.** One slice per branch, CI green before merge.

---

## Appendix A — Testing strategy

| Layer | Tool | Covers | Runs |
|---|---|---|---|
| Unit | Vitest | Pure logic: entitlements, slugs, safety normalization and matching, state machines, price bands | Every PR, and via the Stop hook |
| Integration | Vitest + local Supabase | Services against real Postgres: quotas, caps, visibility, ownership, webhooks, concurrency | Every PR |
| Authorization matrix | Vitest | Every action × every actor → expected outcome | Every PR |
| E2E | Playwright + axe | Critical user journeys, desktop and mobile | Every PR, against a production build |
| Webhooks | Stripe CLI fixtures, Stripe test clocks | Signatures, idempotency, event ordering, renewals | Fixtures every PR; test clocks on staging |
| Load | k6 + scale seed | Browse, detail, search, apply | Test gates 2 and 6, Phase 8 |
| Security | Scripted HTTP + security-reviewer subagent | Everything listed in 8.1 | Test gate 4, Phase 8 |

### Authorization matrix

`tests/authz/matrix.test.ts` is a table: each row is an action, an actor, and the expected result (allowed, or a specific typed error). It calls services and route handlers directly — never the UI.

Actors: anonymous · FREE freelancer · PRO freelancer · freelancer with incomplete profile · user with unverified email · FREE company member (UNVERIFIED) · GROWTH company member (VERIFIED) · TEAM company owner · member of a different company · member of a banned company · admin.

Example actions: view early-access job detail · apply to an early-access job · apply over quota · publish over cap · read another company's applications · write a recruiter note · search candidates · initiate outreach · review without an engagement · open /admin · set own plan · set own role to ADMIN.

Every phase's test gate adds rows for the actions that phase introduced.

### Rules for tests

- Anything touching quotas, caps, visibility, auth, or money is tested against real Postgres, never a mocked Prisma client.
- Time comes from `lib/clock`. Tests set the clock; no sleeps or real-time waits.
- Every paid gate has a test that calls the service or route directly, as a lower-tier actor, and asserts the typed error.
- Every endpoint that takes a resource ID has an IDOR test.
- Concurrency-sensitive rules (quota, post cap, seat cap) have parallel-request tests.
- Tests use factories, never seed data.
- Tests are never weakened, skipped, or deleted to make code pass.

### Test gate command

Save as `.claude/commands/test-gate.md` and run `/test-gate 3`:

```markdown
---
description: Run the end-of-phase test gate for a build phase
argument-hint: [phase-number]
---
Phase $ARGUMENTS test gate. No new features.

1. Run `npm run check` and `npm run test:e2e`. Report results and coverage for
   lib/services, lib/pricing, and lib/auth.
2. List every business rule in CLAUDE.md that this phase touches. For each: the
   server-side enforcement point (file:line) and the test that proves it. Flag any rule
   with no test.
3. Add rows to tests/authz/matrix.test.ts for every action introduced in this phase.
4. Write any missing Playwright tests for this phase's journeys listed in
   docs/BUILD_PLAN.md.
5. Try to break it: call each new server action and route handler directly as every
   wrong actor, and report what happened.
6. Update docs/PROGRESS.md.

Report findings. Fix nothing without my approval.
```

### Your manual checklist at every gate

Click through the phase's journeys on your phone. Try each new paid feature as a free user. Look at the seed data in the UI and ask whether it looks like a real marketplace. Open the Supabase dashboard and check nothing new is exposed.

---

## Appendix B — Add to CLAUDE.md

Merge this into your existing CLAUDE.md, keeping your business rules and tier table as they are.

```markdown
## Versions
Next.js __, Prisma __, @supabase/ssr __. Write code for these versions. If unsure of an
API, check node_modules or the official docs rather than guessing.

## Commands
- `npm run check` — typecheck + lint + unit + integration (run before finishing any slice)
- `npm run test:unit`
- `npm run test:int` — requires `supabase start`
- `npm run test:e2e`
- `npm run db:seed`
- `npm run db:seed-scale` — never against production

## Architecture rules
- Layers: page / server action / route handler → lib/services → lib/db.
  No Prisma calls outside lib/db.
- Every server action and route handler is a public HTTP endpoint. Authenticate, then call
  a service. Services perform their own authorization, ownership, and entitlement checks.
- Tier logic lives only in lib/pricing. Everything else asks getEntitlements().
- Job visibility lives only in visibleJobsWhere().
- Company permissions go only through requireCompanyMember().
- Time comes only from lib/clock. No new Date() in services; no SQL now() in business queries.
- Throw typed errors from lib/errors. Never return ad-hoc error strings.
- Select only the columns a caller needs. Public queries never select private fields.

## Session protocol
1. Read this file and docs/PROGRESS.md.
2. Plan first: files to create or change, schema changes, tests to write, open questions.
   Wait for my approval before writing code.
3. Write tests for the acceptance criteria first. Run them and show they fail.
4. Implement until they pass. Stay inside the slice: no unrelated refactors, no new
   dependencies without asking.
5. Run `npm run check`. Everything must be green.
6. Update docs/PROGRESS.md (what was built, known gaps) and docs/DECISIONS.md (any design
   choice and why).
7. Finish with a table: acceptance criterion → where it's met → which test proves it.

## Testing rules
- Quotas, caps, visibility, auth, and money are tested against real Postgres. Never mock
  Prisma in integration tests.
- Tests set time through lib/clock. No sleeps.
- Every paid gate: a direct-call test as a lower-tier actor asserting the typed error.
- Every endpoint taking a resource ID: an IDOR test.
- Quota, post cap, and seat cap: parallel-request tests.
- Use tests/factories, never seed data.

## Never
- Weaken, skip, or delete a test to make it pass. If a test looks wrong, stop and explain.
- Gate a paid feature only in the UI.
- Accept role, plan, verification status, or ownership from client input.
- Run migrations or seed-scale against production.
- Mark a slice done with failing checks.
```

---

## Appendix C — Features added, and why

P0 = required before real users. P1 = required before charging money. P2 = after launch.

| Feature | Why it matters | Priority | Session |
|---|---|---|---|
| Test harness + CI | v1's Phase 0 said "CI passes", but no session ever set CI up | P0 | 0.3 |
| Entitlements, clock, typed errors from day one | Removes v1's Session 5.3 retrofit and makes time-based rules testable | P0 | 0.5 |
| Supabase RLS lockdown | The anon key ships to every browser; without RLS, tables are reachable through Supabase's API around your service layer | P0 | 0.4 |
| Admin role that can't be self-assigned | v1 captured role at signup with no allowlist requirement | P0 | 0.4 |
| Safety scanner and user reporting before launch | v1 shipped jobs to real users in Phase 2 with no scam detection until Phase 4, and its moderation queue listed reports nothing could create | P0 | 2.2 |
| Job expiry, pause, close, filled | Stale listings erode trust in a job board, and Google's job-posting guidelines expect expired jobs to be marked or removed | P0 | 2.1 |
| Rate limiting + bot protection from the start | Job boards attract spam immediately; v1 added this at the very end | P0 | 0.4, 2.5 |
| Background job runner | Needed for expiry, email, digests, and grace periods; v1 never planned one | P0 | 2.5 |
| Staging environment | Somewhere to run load tests, Stripe test clocks, and abuse runs without touching production | P0 | 2.5 |
| Two-way application messaging | Without it recruiters can't reply to applicants, your "freelancer gets a reply" metric can't be measured, and conversations move to WhatsApp, where scams happen | P0 | 3.4 |
| Application and message emails | Recruiters won't check an inbox nobody tells them about; the hiring loop stalls | P0 | 3.5 |
| Account deletion, data export, legal pages | Privacy-law obligations, and Stripe expects terms and a refund policy on your site | P0 | 1.5 |
| Audit log for admin actions | Bans and removals without a record are a liability | P0 | 4.3 |
| Company entity with team seats | The TEAM plan means nothing without multiple users per company | P1 | 1.3 |
| Plan downgrade and grace-period rules | Otherwise a downgraded company keeps 5 live posts forever, or loses data | P1 | 5.2 |
| Anti-gaming for TRUSTED | Sock-puppet engagements would otherwise buy a trust badge | P1 | 4.2 |
| Screening questions | Better applicants are a concrete reason recruiters pay | P1 | 2.1 |
| Portfolio items | Profile links alone don't sell a freelancer | P1 | 1.2 |
| Availability status | v1's candidate search filtered on it, but nothing captured it | P1 | 1.1 |
| Application withdrawal + freelancer dashboard | Freelancers need to see where they stand | P1 | 3.2 |
| Blocking users | A baseline safety expectation in any messaging product | P1 | 3.4 |
| Outreach daily cap + opt-out | Stops paying recruiters from spamming freelancers | P1 | 6.2 |
| Saved jobs and search alerts | The core retention loop; instant alerts are a natural Pro perk | P1 | 7.1 |
| Recruiter job insights | Helps justify the subscription at renewal time | P2 | 7.3 |
| Product analytics funnels | Shows where users drop out of onboarding | P2 | 7.2 |
| Freelancer identity or skill verification | Mirrors employer verification; a strong Pro perk | P2 | — |
| Featured job posts (one-off payment) | Revenue from recruiters who won't subscribe | P2 | — |
| Public job feed / RSS | Distribution through aggregators | P2 | — |

---

## Reality check before you build more

The riskiest assumption in this plan is still not technical — it's whether recruiters in your niche will pay $79/mo. Have 15 customer conversations. If eight say "yes, I'd pay for that," build with confidence. If two do, change the model before writing more software against it.

Since most of the code already exists, have those conversations during Phase R. The audit and test work doesn't need your full attention, and what you hear might change what you fix first.
