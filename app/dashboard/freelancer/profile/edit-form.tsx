"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceRow } from "@/components/ui/choice";
import { Field, fieldControlProps } from "@/components/ui/field";
import { IconClose, IconPlus } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SkillCategoryGroup } from "@/lib/db/freelancer";
import { COUNTRIES } from "@/lib/geo/countries";

import { saveFreelancerProfile, type ProfileEditState } from "./actions";

const initialState: ProfileEditState = { fieldErrors: {}, formError: null };

/** Mirrors freelancerProfileEditSchema. The server is the authority. */
const HEADLINE_MAX = 120;
const BIO_MIN = 120;
const SKILL_MAX = 20;

const HINTS = {
  displayName: "The name companies will see on your profile and your applications.",
  headline: `One line, up to ${HEADLINE_MAX} characters. What you do and who you do it for.`,
  bio: `At least ${BIO_MIN} characters. Lead with specifics — recruiters skim.`,
  country: "Used for search filters and your price band.",
  timezone: "Companies filter on overlap with their own working hours.",
  hourlyRateUsd: "Whole US dollars. Leave it blank to discuss the rate case by case.",
  githubUrl: "https://github.com/username",
  portfolioUrl: "https://yoursite.dev",
  linkedinUrl: "https://linkedin.com/in/username",
} as const;

// Duplicated from the onboarding form (a different stream owns that file):
// the browser's zone list, with a small fallback for runtimes that do not
// expose Intl.supportedValuesOf.
const FALLBACK_TZ = [
  "UTC",
  "Africa/Cairo",
  "Africa/Lagos",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Manila",
  "Europe/London",
  "Europe/Warsaw",
];

export type FreelancerProfileInitial = {
  displayName: string;
  headline: string;
  bio: string;
  country: string;
  timezone: string;
  hourlyRateUsd: number | null;
  isOpenToWork: boolean;
  githubUrl: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  skills: { slug: string; name: string; yearsExp: number | null }[];
};

type SkillEntry = { slug: string; name: string; years: string };

export function FreelancerProfileEditForm({
  initial,
  skillGroups,
}: {
  initial: FreelancerProfileInitial;
  skillGroups: SkillCategoryGroup[];
}) {
  const [state, formAction, isPending] = useActionState(saveFreelancerProfile, initialState);

  // Every field starts at its current value. An editor that opens empty is an
  // editor that deletes everything the first time somebody saves one change.
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [country, setCountry] = useState(initial.country);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [hourlyRateUsd, setHourlyRateUsd] = useState(initial.hourlyRateUsd?.toString() ?? "");
  const [isOpenToWork, setIsOpenToWork] = useState(initial.isOpenToWork);
  const [githubUrl, setGithubUrl] = useState(initial.githubUrl ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl ?? "");
  const [skills, setSkills] = useState<SkillEntry[]>(() =>
    initial.skills.map((s) => ({
      slug: s.slug,
      name: s.name,
      years: s.yearsExp === null ? "" : String(s.yearsExp),
    })),
  );
  const [pendingSkill, setPendingSkill] = useState("");

  const timezones = useMemo<string[]>(() => {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    let zones = FALLBACK_TZ;
    if (typeof supported === "function") {
      try {
        zones = supported("timeZone");
      } catch {
        zones = FALLBACK_TZ;
      }
    }
    // A zone already on the profile stays selectable even if this browser has
    // never heard of it.
    return timezone && !zones.includes(timezone) ? [timezone, ...zones] : zones;
  }, [timezone]);

  const chosen = useMemo(() => new Set(skills.map((s) => s.slug)), [skills]);

  // The whole set travels as one hidden field: the server replaces the profile's
  // skills with exactly this, so a removal is an absence rather than a command.
  const skillsJson = useMemo(
    () =>
      JSON.stringify(
        skills.map((s) => ({
          slug: s.slug,
          yearsExp: s.years.trim() === "" ? null : Number(s.years),
        })),
      ),
    [skills],
  );

  const addSkill = () => {
    if (pendingSkill === "" || chosen.has(pendingSkill)) return;
    const found = skillGroups.flatMap((g) => g.skills).find((s) => s.slug === pendingSkill);
    if (!found) return;
    setSkills((prev) =>
      [...prev, { slug: found.slug, name: found.name, years: "" }].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setPendingSkill("");
  };

  const removeSkill = (slug: string) =>
    setSkills((prev) => prev.filter((s) => s.slug !== slug));

  const setYears = (slug: string, years: string) =>
    setSkills((prev) => prev.map((s) => (s.slug === slug ? { ...s, years } : s)));

  const err = state.fieldErrors;
  const bioLength = bio.trim().length;
  const atSkillCap = skills.length >= SKILL_MAX;
  const addHint = atSkillCap
    ? `You are at the ${SKILL_MAX}-skill limit. Remove one to add another.`
    : undefined;

  return (
    <form action={formAction} noValidate className="space-y-8">
      {/* Carriers so an unchecked box and the skill set both submit. */}
      <input type="hidden" name="isOpenToWork" value={isOpenToWork ? "on" : ""} />
      <input type="hidden" name="skills" value={skillsJson} />

      {state.formError ? <Notice tone="error">{state.formError}</Notice> : null}

      <section className="space-y-5">
        <h2 className="t-label text-muted-foreground">About you</h2>

        <Field
          label="Display name"
          htmlFor="displayName"
          hint={HINTS.displayName}
          error={err.displayName}
          required
        >
          <Input
            {...fieldControlProps("displayName", {
              hint: HINTS.displayName,
              error: err.displayName,
            })}
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
          />
        </Field>

        <Field
          label="Headline"
          htmlFor="headline"
          hint={HINTS.headline}
          error={err.headline}
          required
        >
          <Input
            {...fieldControlProps("headline", { hint: HINTS.headline, error: err.headline })}
            name="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Senior Shopify developer for high-volume stores"
          />
          <p aria-hidden className="t-data text-[13px] text-muted-foreground">
            {headline.trim().length} / {HEADLINE_MAX}
          </p>
        </Field>

        <Field label="Bio" htmlFor="bio" hint={HINTS.bio} error={err.bio} required>
          <Textarea
            {...fieldControlProps("bio", { hint: HINTS.bio, error: err.bio })}
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={9}
            className="min-h-56"
          />
          <p
            aria-hidden
            className={`flex items-baseline justify-between gap-3 ${
              bioLength < BIO_MIN ? "text-muted-foreground" : "text-success"
            }`}
          >
            <span className="t-label">
              {bioLength < BIO_MIN ? `${BIO_MIN - bioLength} to go` : "Long enough"}
            </span>
            <span className="t-data">{bioLength.toLocaleString("en-US")}</span>
          </p>
        </Field>
      </section>

      <section className="space-y-5 border-t border-border pt-8">
        <h2 className="t-label text-muted-foreground">Work details</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Country"
            htmlFor="country"
            hint={HINTS.country}
            error={err.country}
            required
          >
            <Select
              {...fieldControlProps("country", { hint: HINTS.country, error: err.country })}
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">Select…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Timezone"
            htmlFor="timezone"
            hint={HINTS.timezone}
            error={err.timezone}
            required
          >
            <Select
              {...fieldControlProps("timezone", { hint: HINTS.timezone, error: err.timezone })}
              name="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="">Select…</option>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Hourly rate (USD)"
          htmlFor="hourlyRateUsd"
          hint={HINTS.hourlyRateUsd}
          error={err.hourlyRateUsd}
          optional
        >
          <Input
            {...fieldControlProps("hourlyRateUsd", {
              hint: HINTS.hourlyRateUsd,
              error: err.hourlyRateUsd,
            })}
            name="hourlyRateUsd"
            type="number"
            inputMode="numeric"
            value={hourlyRateUsd}
            onChange={(e) => setHourlyRateUsd(e.target.value)}
            placeholder="45"
            className="max-w-40"
          />
        </Field>

        <ChoiceRow>
          <Checkbox checked={isOpenToWork} onChange={(e) => setIsOpenToWork(e.target.checked)} />
          Open to work right now
        </ChoiceRow>
      </section>

      <section className="space-y-5 border-t border-border pt-8">
        <div>
          <h2 className="t-label text-muted-foreground">Proof of work</h2>
          <p className=" mt-1.5 text-[15px] leading-[22px] text-muted-foreground">
            One linked proof of work is required for a verified badge. All three are optional here.
          </p>
        </div>

        <Field label="GitHub" htmlFor="githubUrl" hint={HINTS.githubUrl} error={err.githubUrl} optional>
          <Input
            {...fieldControlProps("githubUrl", { hint: HINTS.githubUrl, error: err.githubUrl })}
            name="githubUrl"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            inputMode="url"
          />
        </Field>

        <Field
          label="Portfolio or website"
          htmlFor="portfolioUrl"
          hint={HINTS.portfolioUrl}
          error={err.portfolioUrl}
          optional
        >
          <Input
            {...fieldControlProps("portfolioUrl", {
              hint: HINTS.portfolioUrl,
              error: err.portfolioUrl,
            })}
            name="portfolioUrl"
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
            inputMode="url"
          />
        </Field>

        <Field
          label="LinkedIn"
          htmlFor="linkedinUrl"
          hint={HINTS.linkedinUrl}
          error={err.linkedinUrl}
          optional
        >
          <Input
            {...fieldControlProps("linkedinUrl", {
              hint: HINTS.linkedinUrl,
              error: err.linkedinUrl,
            })}
            name="linkedinUrl"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            inputMode="url"
          />
        </Field>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="t-label text-muted-foreground">Skills</h2>
          <p className=" mt-1.5 text-[15px] leading-[22px] text-muted-foreground">
            One to {SKILL_MAX}. Years of experience is optional, and recruiters filter on it.
          </p>
          {err.skills ? (
            <p role="alert" className="mt-1.5 text-[13px] leading-[18px] text-destructive">
              {err.skills}
            </p>
          ) : null}
        </div>

        {skills.length > 0 ? (
          <ul className="rowset">
            {skills.map((s) => (
              <li
                key={s.slug}
                className="row-hover flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
              >
                <span className="min-w-[10rem] flex-1 text-[15px] font-medium">{s.name}</span>
                <span className="flex items-center gap-2">
                  <Input
                    aria-label={`Years of experience with ${s.name}`}
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={s.years}
                    onChange={(e) => setYears(s.slug, e.target.value)}
                    placeholder="—"
                    className="h-8 w-20 px-2 text-[14px]"
                  />
                  <span className="t-label text-muted-foreground">yrs</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => removeSkill(s.slug)}
                >
                  <IconClose />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border border-dashed border-border px-4 py-6 text-[15px] text-muted-foreground">
            No skills listed. Add at least one — it is how you turn up in search.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Add a skill"
            htmlFor="skillToAdd"
            className="min-w-[16rem] flex-1"
            hint={addHint}
          >
            <Select
              {...fieldControlProps("skillToAdd", { hint: addHint })}
              value={pendingSkill}
              onChange={(e) => setPendingSkill(e.target.value)}
              disabled={atSkillCap}
            >
              <option value="">Select a skill…</option>
              {skillGroups.map((group) => (
                <optgroup key={group.slug} label={group.name}>
                  {group.skills
                    .filter((s) => !chosen.has(s.slug))
                    .map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          {/* Ink, not red: the one red element on this page is Save changes. */}
          <Button
            type="button"
            variant="secondary"
            onClick={addSkill}
            disabled={pendingSkill === "" || atSkillCap}
          >
            <IconPlus />
            Add skill
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Changes are live as soon as you save.
        </p>
        <Button type="submit" size="lg" aria-busy={isPending || undefined} disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
