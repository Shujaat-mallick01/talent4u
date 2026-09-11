# DECISIONS

Design choices and why. A decision belongs here when a later session would otherwise be tempted to undo it without knowing the reason.

Newest first.

---

## 2026-09-12 — RLS is deny-all, with zero policies

**Decision:** enable RLS on every table and write **no policies at all**, rather than authoring per-table read policies for `anon`.

**Why:** nothing in this codebase reaches the database through PostgREST. The app connects through Prisma as `postgres`, which owns the tables and has `rolbypassrls = true`; the browser's Supabase client is used for **auth only**; uploads go through the secret key server-side. So the correct number of policies is zero, and any policy written today would be a guess about a feature that does not exist.

**The trap this avoids:** "public data needs a public read policy" sounds right and is wrong here. `/jobs` is public, but it is public *through the Next.js server*, which reads as `postgres`. Adding a `SELECT` policy for `anon` on `Job` would re-open a direct path to the table — including columns the app never selects — to buy nothing.

**Revisit when:** a feature genuinely needs to read from the browser via supabase-js. Then one table gets one policy, deliberately.

---

## 2026-09-12 — Keep result unions; do not adopt `lib/errors`

**BUILD_PLAN v2, Appendix B:** *"Throw typed errors from lib/errors. Never return ad-hoc error strings."*

**Decision:** keep the existing `{ ok: true, … } | { ok: false, reason: "kebab-case-literal" }` unions across the ~26 services, and read v2's rule as banning *untyped* error strings — which this codebase already does.

**Why:** the `reason` values are typed literal unions, not ad-hoc strings. The compiler forces every caller to handle every case; a thrown error does not, and TypeScript cannot type a `catch`. Converting would touch every service and every action and would trade compile-time exhaustiveness for runtime discovery.

**Revisit if:** a case appears where a failure must propagate through several layers that have no reason to know about it. That is the situation exceptions are actually for, and none exists today.

---

## 2026-09-12 — No motion library for the UI revamp

**Decision:** CSS plus the View Transitions API. No `motion`/`framer-motion`.

**Why:** the direction chosen is *expressive marketing, calm product*. The surfaces that want expressive motion are the public, indexed ones, where a 30–50KB bundle costs LCP and therefore ranking — and ranking is this product's entire distribution thesis. The surface that could absorb the bundle is the dashboard, which was explicitly asked to stay calm. The library earns its keep in neither place.

**Revisit if:** something genuinely needs interruptible springs or gesture-driven drag. Bring the specific case, not the general desire.

---

## 2026-09-12 — Expressive register is opt-in, via `.register-expressive`

**Why:** two registers drift into two piles of ad-hoc utilities unless one of them has to be asked for. A product surface cannot pick up the marketing vocabulary by accident. Verified: the landing page carries it, `/jobs` and `/pricing` have zero occurrences.

Also: "expressive" is earned with **size, space and motion**, never by tinting things. BRANDGUIDE volume two's rule — roughly one red thing per view, because a palette where everything is gently branded is a palette where nothing means anything — is untouched.

---

## 2026-09-12 — Scroll reveal defaults to *visible*

**Why:** the animation only applies inside `@supports (animation-timeline: view())`. A browser without scroll-driven timelines shows a finished page rather than an empty one — the failure mode of every JS-driven reveal that has ever shipped broken. `prefers-reduced-motion` is already handled globally by cutting duration to 0.01ms and *holding the end state*, and the end state here is `opacity: 1`.

---

## 2026-09-12 — CSV export carries no email addresses

**Decision:** the Team-tier export contains only fields already public on `/freelancers/[slug]`.

**Why:** the product's trust model runs on conversations that happen on-platform, where the safety scanner can read them and the engagement that unlocks reviews can be confirmed. A bulk contact list moves hiring off-platform and takes both away. The export is a convenience, not a contact list.

**Also:** every value is text a freelancer wrote, so cells beginning `=`, `+`, `-` or `@` are apostrophe-prefixed. Excel and Sheets evaluate those — it is a code-execution surface, not a formatting nicety.

---

## 2026-09-12 — `searchBoost` follows entitlement, not the stored plan

**Why:** a `PAST_DUE` subscription row still *names* `FREELANCER_PRO`. Reading `state.plan` would keep a lapsed member outranking people who are paying. It reads `entitledPlanFrom(state)` — the same function every other gate reads — so the boost lapses on the same event the entitlement does. Written only on an `"applied"` webhook outcome: a `stale` or `superseded` event does not describe the row the account now holds.

---

## 2026-09-12 — Job OG image uses the *anonymous* early-access cutoff

**Why:** an OG image is rendered into other people's chats, so the viewer who matters is never the one who fetched it. Keeping the session out of the route also means a Pro-personalised card can never be cached and served to a stranger. Same reasoning `app/sitemap.ts` already uses. The cost — a Pro who shares an in-window job gets the generic card for up to `EARLY_ACCESS_HOURS` — is the right way round: the job is Pro-only at that moment.

---

## 2026-09-12 — Profile prose is *refused*, not held or flagged

**Why:** a third shape was needed. A job is **held** because `JobStatus` has `PENDING_REVIEW` to hold it in. A message is **flagged after** because it is already delivered by the time it is scanned. A profile has neither: no state meaning "this page is queued", and nothing has gone anywhere yet. So the write is refused and the previously-saved text — itself already scanned — stays live.

**Known cost:** a moderator never learns someone tried. Recording the attempt needs `SafetyFlag` to point at a profile, which it cannot (it has `jobId` and `messageId` only). That is a schema change and is left for one.

---

## 2026-09-12 — Soft-404 fixed with route groups, not by deleting `loading.tsx`

**Why:** deleting them would have fixed the status and lost every loading skeleton. Route groups change no URLs, so `app/jobs/(index)/` keeps the browse skeleton while leaving `/jobs/[slug]` outside any Suspense boundary.

**Recorded because it is counter-intuitive and will otherwise be undone:** a `loading.tsx` costs a route its 404 status. `notFound()` inside a streamed boundary renders the right page under a 200. Calling `notFound()` from `generateMetadata` does **not** help — tried and measured.
