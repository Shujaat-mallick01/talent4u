"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Steps } from "@/components/ui/steps";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/geo/countries";
import type { SkillCategoryGroup } from "@/lib/db/freelancer";

import { submitFreelancerOnboarding, type FreelancerOnboardingState } from "./actions";

const initialFreelancerOnboardingState: FreelancerOnboardingState = {
  fieldErrors: {},
  formError: null,
};

const STEPS = ["About you", "Work details", "Skills"] as const;

// Which step each server-validated field lives on, so a server error jumps
// the user back to the right place.
const FIELD_STEP: Record<string, number> = {
  displayName: 0,
  headline: 0,
  bio: 0,
  country: 1,
  timezone: 1,
  hourlyRateUsd: 1,
  githubUrl: 1,
  portfolioUrl: 1,
  linkedinUrl: 1,
  skills: 2,
};

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

  // Light client gating so users don't advance with obviously-empty steps.
  // The server re-validates everything regardless.
  const canAdvance = (from: number): boolean => {
    if (from === 0) {
      return displayName.trim().length >= 2 && headline.trim().length >= 10 && bio.trim().length >= 120;
    }
    if (from === 1) {
      return country !== "" && timezone !== "";
    }
    return true;
  };

  const err = state.fieldErrors;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="t-heading">Set up your profile</h1>
        <p className="mt-2 measure text-[15px] leading-[22px] text-muted-foreground">
          This is your public page — it is what a company reads before deciding whether to reply.
          You can come back to any of it later.
        </p>
        <p className="t-label mt-2 text-muted-foreground">{email}</p>
        <Steps steps={STEPS} current={step} className="mt-6" />
      </header>

      {state.formError ? (
        <Notice tone="error" className="mb-5">
          {state.formError}
        </Notice>
      ) : null}

      {/* noValidate: steps are toggled with `hidden`, and the browser refuses
          to submit when a native constraint fails on a control it can't focus
          (one in a hidden fieldset). Server-side Zod is the real validator and
          surfaces messages through fieldErrors + FIELD_STEP. */}
      <form action={formAction} noValidate className="space-y-6">
        {/* Always-mounted carriers so every step's value submits regardless of
            which step is visible. */}
        <input type="hidden" name="skills" value={skillsJson} />
        <input type="hidden" name="isOpenToWork" value={isOpenToWork ? "on" : ""} />

        {/* Step 1 — About you */}
        <fieldset hidden={step !== 0} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={Boolean(err.displayName)}
              placeholder="Jane Cooper"
              autoComplete="name"
            />
            <FieldError message={err.displayName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              name="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              aria-invalid={Boolean(err.headline)}
              placeholder="Senior Shopify developer for high-volume stores"
            />
            <p className="text-[13px] leading-[18px] text-muted-foreground">One line. {headline.trim().length}/120</p>
            <FieldError message={err.headline} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              name="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              aria-invalid={Boolean(err.bio)}
              rows={7}
              placeholder="What you do, who you do it for, and the results you've delivered. Recruiters skim — lead with specifics."
            />
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {bio.trim().length} characters (120 minimum)
            </p>
            <FieldError message={err.bio} />
          </div>
        </fieldset>

        {/* Step 2 — Work details */}
        <fieldset hidden={step !== 1} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hourlyRateUsd">Hourly rate (USD, optional)</Label>
            <Input
              id="hourlyRateUsd"
              name="hourlyRateUsd"
              type="number"
              inputMode="numeric"
              value={hourlyRateUsd}
              onChange={(e) => setHourlyRateUsd(e.target.value)}
              aria-invalid={Boolean(err.hourlyRateUsd)}
              placeholder="45"
              className="max-w-40"
            />
            <FieldError message={err.hourlyRateUsd} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isOpenToWork}
              onChange={(e) => setIsOpenToWork(e.target.checked)}
              className="size-4 rounded border-border"
            />
            I&apos;m open to work right now
          </label>

          <fieldset className="space-y-3 rounded-[2px] border border-border p-4">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Proof of work (optional, but strongly recommended)
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="githubUrl">GitHub</Label>
              <Input
                id="githubUrl"
                name="githubUrl"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                aria-invalid={Boolean(err.githubUrl)}
                placeholder="https://github.com/username"
                inputMode="url"
              />
              <FieldError message={err.githubUrl} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portfolioUrl">Portfolio / website</Label>
              <Input
                id="portfolioUrl"
                name="portfolioUrl"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                aria-invalid={Boolean(err.portfolioUrl)}
                placeholder="https://yoursite.dev"
                inputMode="url"
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
                placeholder="https://linkedin.com/in/username"
                inputMode="url"
              />
              <FieldError message={err.linkedinUrl} />
            </div>
          </fieldset>
        </fieldset>

        {/* Step 3 — Skills */}
        <fieldset hidden={step !== 2} className="space-y-4">
          <div>
            <p className="text-sm font-medium">Pick your skills</p>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              Choose 1–20. Add years of experience where you can — recruiters filter on it.{" "}
              {selectedSkills.size} selected.
            </p>
            <FieldError message={err.skills} />
          </div>

          <div className="space-y-5">
            {skillGroups.map((group) => (
              <div key={group.slug}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                </h3>
                <ul className="space-y-1.5">
                  {group.skills.map((skill) => {
                    const selected = selectedSkills.has(skill.slug);
                    return (
                      <li
                        key={skill.slug}
                        className="flex items-center justify-between gap-3 rounded-[2px] border border-border px-3 py-2"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selected}
                            onChange={() => toggleSkill(skill.slug)}
                            className="size-4 rounded border-border"
                          />
                          {skill.name}
                        </label>
                        {selected ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Input
                              aria-label={`Years of experience with ${skill.name}`}
                              type="number"
                              min={0}
                              max={60}
                              step={1}
                              value={selectedSkills.get(skill.slug) ?? ""}
                              onChange={(e) => setSkillYears(skill.slug, e.target.value)}
                              placeholder="yrs"
                              className="h-7 w-16 px-2 text-xs"
                            />
                            yrs
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </fieldset>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || isPending}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={!canAdvance(step)}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={isPending || selectedSkills.size === 0}>
              {isPending ? "Creating profile…" : "Create profile"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
