"use client";

import { useActionState, useMemo, useState } from "react";

import { OnboardingShell, StepNav } from "@/components/onboarding/onboarding-shell";
import { ProfilePreview } from "@/components/onboarding/profile-preview";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/geo/countries";
import type { SkillCategoryGroup } from "@/lib/db/freelancer";
import { cn } from "@/lib/utils";

import { submitFreelancerOnboarding, type FreelancerOnboardingState } from "./actions";

const initialFreelancerOnboardingState: FreelancerOnboardingState = {
  fieldErrors: {},
  formError: null,
};

/**
 * Six questions instead of three forms.
 *
 * The previous shape asked for a name, a headline AND a 120-character bio on
 * one screen before anything else happened — the hardest thing in the whole
 * flow, demanded at the moment someone has invested the least. Writing a bio
 * is much easier once you have already told us your name, said what you do,
 * and picked your skills, because by then the answer is half-written and you
 * have watched a profile appear beside you as you typed.
 *
 * Still ONE form and ONE submit. Steps are `hidden` fieldsets, so there is a
 * single Server Action, a single Zod schema, and no half-written row if
 * somebody closes the tab at question four.
 */
const STEP_COUNT = 6;

// Which step each server-validated field lives on, so a server error jumps
// back to the question that caused it rather than to the top.
const FIELD_STEP: Record<string, number> = {
  displayName: 0,
  headline: 1,
  country: 2,
  timezone: 2,
  skills: 3,
  bio: 4,
  hourlyRateUsd: 4,
  githubUrl: 5,
  portfolioUrl: 5,
  linkedinUrl: 5,
};

const BIO_MIN = 120;

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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] leading-[18px] text-destructive">
      {message}
    </p>
  );
}

export function FreelancerOnboardingForm({
  email,
  skillGroups,
}: {
  email: string;
  skillGroups: SkillCategoryGroup[];
}) {
  const [state, formAction, isPending] = useActionState(
    submitFreelancerOnboarding,
    initialFreelancerOnboardingState,
  );

  const [step, setStep] = useState(0);

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [hourlyRateUsd, setHourlyRateUsd] = useState("");
  const [isOpenToWork, setIsOpenToWork] = useState(true);
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  // slug -> years-of-experience string ("" = unspecified)
  const [selectedSkills, setSelectedSkills] = useState<Map<string, string>>(new Map());

  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  });

  const timezones = useMemo<string[]>(() => {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    let zones = FALLBACK_TZ;
    if (typeof supported === "function") {
      try {
        zones = supported("timeZone");
      } catch {
        zones = FALLBACK_TZ;
      }
    }
    return timezone && !zones.includes(timezone) ? [timezone, ...zones] : zones;
  }, [timezone]);

  // A server error sends the user back to the earliest step that has one.
  // Handled during render (React's "adjust state on prop change" pattern)
  // rather than in an effect, keyed on the action state's identity so it
  // fires once per server response.
  const [handledErrors, setHandledErrors] = useState(state.fieldErrors);
  if (state.fieldErrors !== handledErrors) {
    setHandledErrors(state.fieldErrors);
    const keys = Object.keys(state.fieldErrors);
    if (keys.length > 0) {
      setStep(Math.min(...keys.map((k) => FIELD_STEP[k] ?? 0)));
    }
  }

  const skillsJson = useMemo(
    () =>
      JSON.stringify(
        Array.from(selectedSkills, ([slug, years]) => ({
          slug,
          yearsExp: years.trim() === "" ? null : Number(years),
        })),
      ),
    [selectedSkills],
  );

  const skillNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of skillGroups) {
      for (const skill of group.skills) map.set(skill.slug, skill.name);
    }
    return map;
  }, [skillGroups]);

  const selectedSkillNames = useMemo(
    () => Array.from(selectedSkills.keys(), (slug) => skillNameBySlug.get(slug) ?? slug),
    [selectedSkills, skillNameBySlug],
  );

  const toggleSkill = (slug: string) =>
    setSelectedSkills((prev) => {
      const next = new Map(prev);
      if (next.has(slug)) next.delete(slug);
      else next.set(slug, "");
      return next;
    });

  const setSkillYears = (slug: string, years: string) =>
    setSelectedSkills((prev) => {
      const next = new Map(prev);
      if (next.has(slug)) next.set(slug, years);
      return next;
    });

  const err = state.fieldErrors;
  const bioLength = bio.trim().length;

  /**
   * Whether the question on screen has a usable answer. Convenience only —
   * every one of these is re-checked server-side by the Zod schema, which is
   * the check that counts.
   */
  const GATES: { ok: boolean; hint: string }[] = [
    { ok: displayName.trim().length >= 2, hint: "At least two characters." },
    { ok: headline.trim().length >= 10, hint: "At least ten characters." },
    { ok: country !== "" && timezone !== "", hint: "Pick a country and a timezone." },
    { ok: selectedSkills.size > 0, hint: "Choose at least one." },
    { ok: bioLength >= BIO_MIN, hint: `${bioLength} of ${BIO_MIN} characters.` },
    { ok: true, hint: "" },
  ];

  const QUESTIONS: { question: string; why: React.ReactNode }[] = [
    {
      question: "What should we call you?",
      why: "The name companies will see. Your real name or the one you trade under — not a username.",
    },
    {
      question: "What do you do?",
      why: "One line, the way you would say it to someone at a conference. This sits under your name everywhere you appear.",
    },
    {
      question: "Where do you work from?",
      why: "Companies filter on both, and your timezone is what tells them whether your hours overlap with theirs.",
    },
    {
      question: "What are you good at?",
      why: "Pick everything you would genuinely take work in. This is what search matches you on, so an empty list means an empty inbox.",
    },
    {
      question: "Tell companies who you are",
      why: "What you do, who you do it for, and what came of it. Recruiters skim — lead with specifics, not adjectives.",
    },
    {
      question: "Where can they see your work?",
      why: "Optional, and the single biggest thing that gets a reply. One real link beats any description of it.",
    },
  ];

  const isLast = step === STEP_COUNT - 1;
  const current = QUESTIONS[step];

  return (
    <OnboardingShell
      stepIndex={step}
      stepCount={STEP_COUNT}
      question={current.question}
      why={current.why}
      onBack={step === 0 ? undefined : () => setStep((s) => Math.max(0, s - 1))}
      aside={
        <ProfilePreview
          displayName={displayName}
          headline={headline}
          bio={bio}
          country={country}
          hourlyRateUsd={hourlyRateUsd}
          skills={selectedSkillNames}
          isOpenToWork={isOpenToWork}
        />
      }
    >
      {state.formError ? (
        <Notice tone="error" className="mb-6">
          {state.formError}
        </Notice>
      ) : null}

      {/* noValidate: steps are toggled with `hidden`, and the browser refuses
          to submit when a native constraint fails on a control it cannot focus
          (one in a hidden fieldset). Server-side Zod is the real validator and
          surfaces messages through fieldErrors + FIELD_STEP. */}
      <form action={formAction} noValidate>
        {/* Always mounted, so every answer submits whichever step is showing. */}
        <input type="hidden" name="skills" value={skillsJson} />
        <input type="hidden" name="isOpenToWork" value={isOpenToWork ? "on" : ""} />

        {/* 1 — Name */}
        <fieldset hidden={step !== 0}>
          <Label htmlFor="displayName" className="sr-only">
            Display name
          </Label>
          <Input
            id="displayName"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={Boolean(err.displayName)}
            placeholder="Jane Cooper"
            autoComplete="name"
            inputSize="lg"
            className="max-w-md"
          />
          <FieldError message={err.displayName} />
          <p className="t-label mt-4 text-muted-foreground">Signed in as {email}</p>
        </fieldset>

        {/* 2 — Headline */}
        <fieldset hidden={step !== 1}>
          <Label htmlFor="headline" className="sr-only">
            Headline
          </Label>
          <Input
            id="headline"
            name="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            aria-invalid={Boolean(err.headline)}
            placeholder="Senior Shopify developer for high-volume stores"
            inputSize="lg"
            maxLength={120}
          />
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              Good: “Shopify developer for stores doing $1M+”. Weak: “Passionate full-stack
              developer”.
            </p>
            <p className="t-data text-[13px] text-muted-foreground">{headline.trim().length}/120</p>
          </div>
          <FieldError message={err.headline} />
        </fieldset>

        {/* 3 — Location */}
        <fieldset hidden={step !== 2} className="grid max-w-lg gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Select
              id="country"
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-invalid={Boolean(err.country)}
            >
              <option value="">Select…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
            <FieldError message={err.country} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              aria-invalid={Boolean(err.timezone)}
            >
              <option value="">Select…</option>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
            <FieldError message={err.timezone} />
          </div>
        </fieldset>

        {/* 4 — Skills */}
        <fieldset hidden={step !== 3}>
          <p className="text-[15px] text-muted-foreground">
            <span className="t-data text-foreground">{selectedSkills.size}</span> selected · add
            years where you can, recruiters filter on it
          </p>
          <FieldError message={err.skills} />

          <div className="mt-5 space-y-6">
            {skillGroups.map((group) => (
              <div key={group.slug}>
                <h2 className="t-label mb-2.5 text-muted-foreground">{group.name}</h2>
                <ul className="flex flex-wrap gap-2">
                  {group.skills.map((skill) => {
                    const selected = selectedSkills.has(skill.slug);
                    return (
                      <li key={skill.slug}>
                        {/* A tappable chip, not a checkbox in a row. Picking
                            twelve skills out of a list of checkboxes is a
                            chore; picking them out of a wall of chips is not. */}
                        <label
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[15px] leading-5 transition-colors",
                            selected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card hover:bg-muted",
                            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                          )}
                        >
                          <Checkbox
                            checked={selected}
                            onChange={() => toggleSkill(skill.slug)}
                            className="sr-only"
                          />
                          {skill.name}
                          {selected ? (
                            <Input
                              aria-label={`Years of experience with ${skill.name}`}
                              type="number"
                              min={0}
                              max={60}
                              step={1}
                              value={selectedSkills.get(skill.slug) ?? ""}
                              onChange={(e) => setSkillYears(skill.slug, e.target.value)}
                              onClick={(e) => e.preventDefault()}
                              placeholder="yrs"
                              className="h-6 w-14 border-background/30 bg-transparent px-1.5 text-[13px] text-background placeholder:text-background/50"
                            />
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </fieldset>

        {/* 5 — Bio, rate, availability */}
        <fieldset hidden={step !== 4} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="bio" className="sr-only">
              Bio
            </Label>
            <Textarea
              id="bio"
              name="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              aria-invalid={Boolean(err.bio)}
              rows={8}
              placeholder="I build Shopify storefronts for brands doing $1M+ a year. Last year I rebuilt checkout for a skincare brand and their conversion went from 1.8% to 2.6%…"
            />
            <div className="flex items-baseline justify-between gap-3">
              <FieldError message={err.bio} />
              <p
                className={cn(
                  "t-data ml-auto text-[13px]",
                  bioLength >= BIO_MIN ? "text-success" : "text-muted-foreground",
                )}
              >
                {bioLength}/{BIO_MIN}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="hourlyRateUsd">Hourly rate in USD (optional)</Label>
              <Input
                id="hourlyRateUsd"
                name="hourlyRateUsd"
                type="number"
                inputMode="numeric"
                value={hourlyRateUsd}
                onChange={(e) => setHourlyRateUsd(e.target.value)}
                aria-invalid={Boolean(err.hourlyRateUsd)}
                placeholder="45"
                className="w-32"
              />
              <FieldError message={err.hourlyRateUsd} />
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
              <Checkbox
                checked={isOpenToWork}
                onChange={(e) => setIsOpenToWork(e.target.checked)}
              />
              I&apos;m open to work right now
            </label>
          </div>
        </fieldset>

        {/* 6 — Proof of work */}
        <fieldset hidden={step !== 5} className="max-w-lg space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="githubUrl">GitHub</Label>
            <Input
              id="githubUrl"
              name="githubUrl"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              aria-invalid={Boolean(err.githubUrl)}
              placeholder="https://github.com/janecooper"
            />
            <FieldError message={err.githubUrl} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portfolioUrl">Portfolio or website</Label>
            <Input
              id="portfolioUrl"
              name="portfolioUrl"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              aria-invalid={Boolean(err.portfolioUrl)}
              placeholder="https://janecooper.dev"
            />
            <FieldError message={err.portfolioUrl} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linkedinUrl">LinkedIn</Label>
            <Input
              id="linkedinUrl"
              name="linkedinUrl"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              aria-invalid={Boolean(err.linkedinUrl)}
              placeholder="https://linkedin.com/in/janecooper"
            />
            <FieldError message={err.linkedinUrl} />
          </div>
        </fieldset>

        <StepNav
          canAdvance={GATES[step].ok}
          hint={GATES[step].hint}
          isLast={isLast}
          isPending={isPending}
          onNext={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}
          submitLabel="Create my profile"
        />
      </form>
    </OnboardingShell>
  );
}
