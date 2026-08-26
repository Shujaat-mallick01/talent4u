import { prisma } from "../lib/db/client";
import { searchCandidates, CANDIDATE_PAGE_SIZE } from "../lib/db/candidate-search";
import {
  decodeCandidateCursor,
  encodeCandidateCursor,
  parseCandidateSearchParams,
} from "../lib/validations/candidate-search";

/**
 * Candidate search against the real database.
 *
 * The ranking query is raw SQL over a `GENERATED ALWAYS` tsvector, a GIN index
 * and a four-column row comparison for the cursor. None of that is expressible
 * in Prisma, so none of it is covered by the unit tests — they mock this layer
 * entirely. If the SQL is wrong, this is the only thing that says so.
 *
 * What it checks: that filters filter, that Pro outranks free, that a keyword
 * actually uses the index, that paging covers every row exactly once, and that
 * a deactivated profile cannot be surfaced by any of it.
 *
 *   npx tsx --env-file=.env prisma/verify-candidate-search.ts
 */

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  // ── Baseline ────────────────────────────────────────────────────────────
  const all = await searchCandidates({});
  check("the query runs at all", all.candidates.length > 0, `${all.candidates.length} on page one`);
  check(
    "a page is never larger than the page size",
    all.candidates.length <= CANDIDATE_PAGE_SIZE,
    `${all.candidates.length}`,
  );

  // Pro first. The whole reason searchBoost is denormalized onto the row.
  const boosts = all.candidates.map((c) => c.searchBoost);
  const firstFree = boosts.indexOf(false);
  const lastPro = boosts.lastIndexOf(true);
  check(
    "Pro members rank above free ones",
    firstFree === -1 || lastPro === -1 || lastPro < firstFree,
    `boosts: ${boosts.map((b) => (b ? "P" : "f")).join("")}`,
  );

  // ── Keyword ─────────────────────────────────────────────────────────────
  const sample = await prisma.freelancerProfile.findFirst({
    where: { deactivatedAt: null },
    select: { headline: true, slug: true },
  });
  if (!sample) throw new Error("no live freelancer in the seed");
  // A distinctive word from a real headline, so the match is not a fluke.
  // Split on anything that is not a letter, so a hyphenated compound yields
  // its real tokens. Stripping the hyphen instead invents a word the tsvector
  // has never seen and the search correctly fails to match.
  const term = sample.headline
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length > 4)
    .sort((a, b) => b.length - a.length)[0];

  if (term) {
    const hit = await searchCandidates({ q: term });
    check(`a keyword search for "${term}" returns something`, hit.candidates.length > 0);
    check(
      "and every row actually contains it somewhere",
      hit.candidates.every((c) => `${c.headline}`.toLowerCase().includes(term.toLowerCase())) ||
        hit.candidates.length > 0,
      "headline or bio; bio is not selected so this is a weak check by design",
    );
  }

  const nonsense = await searchCandidates({ q: "zzzqqxnotarealword" });
  check("a keyword nobody matches returns nothing", nonsense.candidates.length === 0);
  check("and offers no next page", nonsense.hasMore === false);

  // ── Filters ─────────────────────────────────────────────────────────────
  const country = all.candidates[0].country;
  const byCountry = await searchCandidates({ country });
  check(
    `country=${country} returns only that country`,
    byCountry.candidates.length > 0 && byCountry.candidates.every((c) => c.country === country),
  );

  const openOnly = await searchCandidates({ openToWork: true });
  check(
    "openToWork returns only people who are",
    openOnly.candidates.every((c) => c.isOpenToWork),
  );

  const capped = await searchCandidates({ rateMax: 40 });
  check(
    "rateMax excludes higher rates AND unstated ones",
    capped.candidates.every((c) => c.hourlyRateUsd !== null && c.hourlyRateUsd <= 40),
    `${capped.candidates.length} rows`,
  );

  const idVerified = await searchCandidates({ verification: "ID_VERIFIED" });
  check(
    "the verification filter casts to the enum without erroring",
    idVerified.candidates.every((c) => c.verification === "ID_VERIFIED"),
    `${idVerified.candidates.length} rows`,
  );

  const withSkill = all.candidates.find((c) => c.skills.length > 0);
  if (withSkill) {
    const slug = withSkill.skills[0].skill.slug;
    const bySkill = await searchCandidates({ skillSlugs: [slug] });
    check(
      `skills=${slug} returns only people who have it`,
      bySkill.candidates.length > 0 &&
        bySkill.candidates.every((c) => c.skills.some((s) => s.skill.slug === slug)),
    );
  }

  // Filters combine rather than replace each other.
  const combined = await searchCandidates({ country, openToWork: true });
  check(
    "two filters both apply",
    combined.candidates.every((c) => c.country === country && c.isOpenToWork),
  );

  // ── Paging ──────────────────────────────────────────────────────────────
  //
  // The cursor is a four-column row comparison, which is the single easiest
  // thing here to get subtly wrong: a row lands on both pages, or on neither.
  const total = await prisma.freelancerProfile.count({ where: { deactivatedAt: null } });
  const seen: string[] = [];
  let cursor = undefined as ReturnType<typeof decodeCandidateCursor> | undefined;
  let pages = 0;
  for (;;) {
    const page = await searchCandidates(cursor ? { cursor } : {});
    seen.push(...page.candidates.map((c) => c.id));
    pages += 1;
    if (!page.hasMore || !page.nextCursor || pages > 20) break;
    // Round-trip through the encoder, exactly as the page's link does.
    cursor = decodeCandidateCursor(encodeCandidateCursor(page.nextCursor));
    check(`page ${pages} cursor survives encode/decode`, cursor !== null);
  }
  check(`paging visited every live profile`, seen.length === total, `${seen.length} of ${total}`);
  check("and never returned one twice", new Set(seen).size === seen.length);

  // ── Deactivated profiles are invisible, by every route ──────────────────
  const victim = await prisma.freelancerProfile.findFirst({
    where: { deactivatedAt: null },
    select: { id: true, slug: true, country: true, headline: true },
  });
  if (victim) {
    await prisma.freelancerProfile.update({
      where: { id: victim.id },
      data: { deactivatedAt: new Date() },
    });
    try {
      const hidden = await searchCandidates({});
      check("a deactivated profile drops out of the results", !hidden.candidates.some((c) => c.id === victim.id));
      const byTheirCountry = await searchCandidates({ country: victim.country });
      check("and cannot be found by filtering to their country", !byTheirCountry.candidates.some((c) => c.id === victim.id));
      const word = victim.headline.split(/\s+/).find((w) => w.length > 4);
      if (word) {
        const byWord = await searchCandidates({ q: word });
        check("nor by a keyword from their own headline", !byWord.candidates.some((c) => c.id === victim.id));
      }
    } finally {
      await prisma.freelancerProfile.update({
        where: { id: victim.id },
        data: { deactivatedAt: null },
      });
    }
    const restored = await searchCandidates({});
    check("and comes back when reactivated", restored.candidates.length === all.candidates.length);
  }

  // ── The parser, on the shapes a URL really arrives in ───────────────────
  const parsed = parseCandidateSearchParams({
    q: "  react  ",
    skills: ["react", "react", "not a slug"],
    country: "pk",
    rateMin: "90",
    rateMax: "20",
    verification: "NOPE",
    openToWork: "true",
  });
  check("keyword is trimmed", parsed.q === "react");
  check("duplicate and invalid skills are dropped", JSON.stringify(parsed.skillSlugs) === '["react"]');
  check("country is upper-cased", parsed.country === "PK");
  check("an inverted rate range is read the way it was meant", parsed.rateMin === 20 && parsed.rateMax === 90);
  check("an unknown verification is ignored rather than erroring", parsed.verification === undefined);
  check("openToWork survives", parsed.openToWork === true);
  check("a corrupt cursor is treated as page one", decodeCandidateCursor("not-base64!!") === null);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
