import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { prisma } from "../lib/db/client";

/**
 * The design system, checked against what the server actually renders.
 *
 * This exists because of a specific failure: the brand tokens were amended
 * (volume two — soft radius, elevated cards, a sunken page) and then only two
 * pages were migrated. Everything else kept drawing hairline rules on a white
 * ground, so the product had two visual languages at once and looked broken in
 * exactly the way a half-finished refactor looks broken. Nothing caught it,
 * because every test in the repo asks whether the code is correct and none of
 * them asks whether the pages agree with each other.
 *
 * So this is a consistency check, not a snapshot. It does not care what a page
 * looks like; it cares that no page is still speaking the old language:
 *
 *   - every page gives its content a SURFACE (a card, or a rowset), rather
 *     than leaving text adrift on the sunken page colour
 *   - nothing paints itself with the page colour any more (`bg-background` was
 *     white before the amendment and is grey after, which is what turned the
 *     sidebar and the sticky header grey against white cards)
 *   - the 2px corner is gone everywhere, not nearly everywhere
 *   - headings come from the type scale, not from ad-hoc text-3xl guesses
 *
 * Requires the dev server.
 *
 *   npm run dev
 *   npx tsx --env-file=.env prisma/verify-ui.ts
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PASSWORD = process.env.DEV_SEED_PASSWORD ?? "Talent4u-dev-2026";
const MAX_CHUNK = 3180;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function cookieFor(email: string): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  }
  const name = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const value = `base64-${Buffer.from(await response.text(), "utf-8").toString("base64")}`;
  if (value.length <= MAX_CHUNK) return `${name}=${value}`;
  const chunks: string[] = [];
  for (let i = 0, n = 0; i < value.length; i += MAX_CHUNK, n += 1) {
    chunks.push(`${name}.${n}=${value.slice(i, i + MAX_CHUNK)}`);
  }
  return chunks.join("; ");
}

/** Every class attribute in the document, as one list. */
function classAttrs(html: string): string[] {
  return [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
}

const countClass = (html: string, token: string): number =>
  classAttrs(html).filter((c) => c.split(/\s+/).includes(token)).length;

const anyClassMatching = (html: string, re: RegExp): string[] =>
  classAttrs(html).filter((c) => re.test(c));

async function audit(label: string, path: string, cookie?: string): Promise<void> {
  const response = await fetch(`${SITE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const html = await response.text();

  if (response.status !== 200) {
    check(`${label} renders`, false, `status ${response.status}`);
    return;
  }

  // A surface for the content. `rowset` counts: it is a white rounded card
  // with hairlines inside, which is a surface — a page of records does not
  // need a second box around it.
  const surfaces = countClass(html, "surface-card") + countClass(html, "rowset");
  check(`${label} houses its content on a surface`, surfaces > 0, `${surfaces} found`);

  // The seam. `bg-background` means "paint me the colour of the page", which
  // was white before the amendment and is the sunken grey after it.
  const pageColour = anyClassMatching(html, /(^|\s)bg-background(\s|$)/);
  check(
    `${label} paints nothing with the page colour`,
    pageColour.length === 0,
    pageColour.slice(0, 2).join(" | "),
  );

  // The old corner.
  const oldRadius = anyClassMatching(html, /rounded-\[[12]px\]/);
  check(`${label} has no 2px corners left`, oldRadius.length === 0, oldRadius.slice(0, 2).join(" | "));

  // BRANDGUIDE volume one, section 03: the primary lockup has a minimum
  // width of 120px. It was shipping at about 40px in the header and the
  // footer of every page, which put the wordmark at roughly five pixels tall.
  // Height classes are what caused that, so the rule checked here is that the
  // mark is sized by an explicit width, and that the width clears the floor.
  const lockups = [...html.matchAll(/<svg[^>]*aria-label="TALENT4U"[^>]*>/g)].map((m) => m[0]);
  const undersized = lockups.filter((tag) => {
    const width = /\bw-\[(\d+)px\]/.exec(tag);
    return !width || Number(width[1]) < 120;
  });
  check(
    `${label} renders the lockup at its minimum width`,
    undersized.length === 0,
    undersized.length ? `${undersized.length} of ${lockups.length} under 120px` : "",
  );

  // The page frame. Every public page hangs off one container token, so the
  // left edge of its content lines up with the logo in the header above it.
  // Six different widths used to be in play — 1240, 1024, 896, 768 — under a
  // single header, and nothing lined up with anything. The FIRST centred
  // container inside <main> is the frame; narrower columns inside it are the
  // page's own business.
  const mainStart = html.indexOf("<main");
  if (mainStart !== -1) {
    const frame = [...html.slice(mainStart).matchAll(/class="([^"]*mx-auto[^"]*)"/g)]
      .map((m) => m[1])
      .find((c) => /max-w-/.test(c));
    if (frame) {
      check(
        `${label} hangs off the shared container`,
        frame.includes("container-marketing"),
        frame.length > 90 ? `${frame.slice(0, 90)}…` : frame,
      );
    }
  }

  // Ad-hoc display type. The scale is .t-display-*/.t-heading/.t-subhead; a
  // text-3xl in a heading means a page that never got the type system.
  const adHoc = [...html.matchAll(/<h[12][^>]*class="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((c) => /\btext-(xl|2xl|3xl|4xl)\b/.test(c));
  check(`${label} sizes its headings from the scale`, adHoc.length === 0, adHoc.slice(0, 2).join(" | "));
}

/**
 * Onboarding is the one flow no seeded account can reach: every one of them
 * already has a profile, so the page redirects straight to the dashboard. So
 * it gets a throwaway account, which is removed again at the end.
 */
async function auditOnboarding(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.log("SKIP  onboarding — SUPABASE_SECRET_KEY not set");
    return;
  }
  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const [role, path, question, steps] of [
    ["FREELANCER", "/onboarding/freelancer", "What should we call you?", 6],
    ["RECRUITER", "/onboarding/recruiter", "What is your company called?", 5],
  ] as const) {
    const id = randomUUID();
    const email = `ui-check-${id.slice(0, 8)}@talent4u.test`;
    const created = await admin.auth.admin.createUser({
      // Same id as the Prisma row, exactly as prisma/dev-auth-users.ts does.
      id,
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (created.error) {
      check(`${role} onboarding fixture`, false, created.error.message);
      continue;
    }
    await prisma.user.create({ data: { id, email, role } });

    try {
      const cookie = await cookieFor(email);
      const response = await fetch(`${SITE}${path}`, { headers: { cookie }, redirect: "manual" });
      const html = await response.text();
      const label = `${role.toLowerCase()} onboarding`;

      check(`${label} renders`, response.status === 200, `status ${response.status}`);
      if (response.status !== 200) continue;

      // The heading IS the question.
      check(`${label} leads with the question`, html.includes(question));

      // One question on screen. Every other step is a hidden fieldset, so the
      // count of hidden ones is exactly one fewer than the number of steps.
      const hidden = (html.match(/<fieldset[^>]*\bhidden\b/g) ?? []).length;
      check(`${label} shows one question at a time`, hidden === steps - 1, `${hidden} hidden of ${steps - 1}`);

      check(`${label} says how far along you are`, html.includes(`Step 1 of ${steps}`));

      // Forward is shut until the first question is answered.
      check(`${label} starts with Next disabled`, /<button[^>]*disabled[^>]*>\s*Next/.test(html));

      // No way back from the first question, so no dead control offering one.
      check(
        `${label} offers no back button on the first question`,
        !html.includes("Back to the previous question"),
      );

      // The panel earns its place by previewing what is being built.
      check(`${label} previews what is being built`, /Your (public profile|company page)/.test(html));

      await audit(label, path, cookie);
    } finally {
      await prisma.user.deleteMany({ where: { id } });
      await admin.auth.admin.deleteUser(id);
    }
  }

  // An account with a session but NO app row — which, since signup stopped
  // asking for a role, is every brand-new account whichever way they signed
  // up. It must land on the role question rather than anywhere else.
  const id = randomUUID();
  const email = `ui-role-${id.slice(0, 8)}@talent4u.test`;
  const created = await admin.auth.admin.createUser({
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) {
    check("role-question fixture", false, created.error.message);
    return;
  }
  try {
    const cookie = await cookieFor(email);
    const response = await fetch(`${SITE}/onboarding`, {
      headers: { cookie },
      redirect: "manual",
    });
    const html = await response.text();

    check("role question renders for a roleless account", response.status === 200, `status ${response.status}`);
    if (response.status === 200) {
      check("it asks the question as the heading", html.includes("How will you use Talent4u?"));
      check("both roles are offered", html.includes("I&#x27;m looking for work") || html.includes("I'm looking for work"));
      check("continue is disabled until one is picked", /<button[^>]*disabled[^>]*>\s*Continue/.test(html));
    }

    // And signup itself must no longer ask.
    const signup = await fetch(`${SITE}/signup`);
    const signupHtml = await signup.text();
    check(
      "signup no longer asks for a role",
      !signupHtml.includes("How will you use Talent4u?") && !signupHtml.includes('name="role"'),
    );
  } finally {
    await prisma.user.deleteMany({ where: { id } });
    await admin.auth.admin.deleteUser(id);
  }
}

async function main() {
  console.log("── Public ──────────────────────────────────────────────────");
  for (const [label, path] of [
    ["home", "/"],
    ["jobs", "/jobs"],
    ["freelancers", "/freelancers"],
    ["pricing", "/pricing"],
    ["contact", "/contact"],
    ["removed employers", "/removed-employers"],
    ["privacy", "/privacy"],
    ["terms", "/terms"],
    ["sign in", "/signin"],
    ["sign up", "/signup"],
  ] as const) {
    await audit(label, path);
  }

  const freelancer = await prisma.user.findFirstOrThrow({
    where: { role: "FREELANCER", freelancer: { isNot: null } },
    select: { email: true },
  });
  const recruiter = await prisma.user.findFirstOrThrow({
    where: { role: "RECRUITER", recruiter: { isNot: null } },
    select: { email: true },
  });

  console.log("\n── Freelancer ──────────────────────────────────────────────");
  const asFreelancer = await cookieFor(freelancer.email);
  for (const [label, path] of [
    ["freelancer dashboard", "/dashboard/freelancer"],
    ["profile editor", "/dashboard/freelancer/profile"],
    ["verification", "/dashboard/freelancer/verification"],
    ["saved jobs", "/dashboard/saved"],
    ["messages", "/dashboard/messages"],
    ["settings", "/dashboard/settings"],
    ["billing", "/dashboard/billing"],
  ] as const) {
    await audit(label, path, asFreelancer);
  }

  console.log("\n── Recruiter ───────────────────────────────────────────────");
  const asRecruiter = await cookieFor(recruiter.email);
  for (const [label, path] of [
    ["recruiter dashboard", "/dashboard/recruiter"],
    ["company page editor", "/dashboard/recruiter/company"],
    ["recruiter verification", "/dashboard/recruiter/verification"],
    ["new job", "/dashboard/recruiter/jobs/new"],
    ["recruiter billing", "/dashboard/billing"],
  ] as const) {
    await audit(label, path, asRecruiter);
  }

  console.log("\n── Onboarding ──────────────────────────────────────────────");
  await auditOnboarding();

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
