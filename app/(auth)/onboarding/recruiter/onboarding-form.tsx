"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/geo/countries";
import { LOGO_ACCEPT } from "@/lib/validations/recruiter";

import {
  initialRecruiterOnboardingState,
  submitRecruiterOnboarding,
} from "./actions";

const STEPS = ["Company", "Verification"] as const;

const FIELD_STEP: Record<string, number> = {
  companyName: 0,
  companyDomain: 0,
  websiteUrl: 0,
  country: 0,
  description: 0,
  registrationNo: 1,
  linkedinUrl: 1,
  logo: 1,
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function RecruiterOnboardingForm({
  email,
  companyDomainHint,
}: {
  email: string;
  companyDomainHint: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    submitRecruiterOnboarding,
    initialRecruiterOnboardingState,
  );

  const [step, setStep] = useState(0);

  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState(companyDomainHint ?? "");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [logoName, setLogoName] = useState<string | null>(null);

  // On any server-error return, jump to the earliest step carrying an error
  // (adjust-on-render). React 19 resets the uncontrolled file input when the
  // action completes, so also clear the label — otherwise it keeps claiming a
  // logo is attached that the browser has already dropped, and the next submit
  // would silently create a profile with no logo.
  const [handledErrors, setHandledErrors] = useState(state.fieldErrors);
  if (state.fieldErrors !== handledErrors) {
    setHandledErrors(state.fieldErrors);
    setLogoName(null);
    const keys = Object.keys(state.fieldErrors);
    if (keys.length > 0) setStep(Math.min(...keys.map((k) => FIELD_STEP[k] ?? 0)));
  }

  const canAdvance = (from: number): boolean =>
    from !== 0 || (companyName.trim().length >= 2 && country !== "");

  const err = state.fieldErrors;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your company</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {email}. New companies start <span className="font-medium">Unverified</span> —
          you can verify later to earn a badge and full access.
        </p>
        <ol className="mt-4 flex gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={
                "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium " +
                (i === step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i < step
                    ? "border-border bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground")
              }
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </header>

      {state.formError ? (
        <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}

      <form action={formAction} noValidate encType="multipart/form-data" className="space-y-6">
        {/* Step 1 — Company */}
        <fieldset hidden={step !== 0} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="companyName">Company name</Label>
            <Input
              id="companyName"
              name="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              aria-invalid={Boolean(err.companyName)}
              placeholder="Acme Commerce Ltd"
              autoComplete="organization"
            />
            <FieldError message={err.companyName} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="companyDomain">Company domain</Label>
              <Input
                id="companyDomain"
                name="companyDomain"
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                aria-invalid={Boolean(err.companyDomain)}
                placeholder="acme.com"
                inputMode="url"
              />
              <FieldError message={err.companyDomain} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="websiteUrl">Website</Label>
              <Input
                id="websiteUrl"
                name="websiteUrl"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                aria-invalid={Boolean(err.websiteUrl)}
                placeholder="https://acme.com"
                inputMode="url"
              />
              <FieldError message={err.websiteUrl} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-invalid={Boolean(err.country)}
              className="h-9 w-full rounded-md border border-border bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-xs"
            >
              <option value="">Select…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError message={err.country} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">About the company (optional)</Label>
            <Textarea
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(err.description)}
              rows={5}
              placeholder="What you build, who you hire, and how you work with freelancers. Shown on your public company page."
            />
            <FieldError message={err.description} />
          </div>
        </fieldset>

        {/* Step 2 — Verification & logo */}
        <fieldset hidden={step !== 1} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Optional now — these speed up verification later. Nothing here verifies your company
            yet.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="registrationNo">Company registration number</Label>
            <Input
              id="registrationNo"
              name="registrationNo"
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value)}
              aria-invalid={Boolean(err.registrationNo)}
              placeholder="e.g. 09876543"
            />
            <FieldError message={err.registrationNo} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="linkedinUrl">Company LinkedIn</Label>
            <Input
              id="linkedinUrl"
              name="linkedinUrl"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              aria-invalid={Boolean(err.linkedinUrl)}
              placeholder="https://linkedin.com/company/acme"
              inputMode="url"
            />
            <FieldError message={err.linkedinUrl} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="logo">Company logo (PNG, JPEG, or WebP, up to 2 MB)</Label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept={LOGO_ACCEPT}
              aria-invalid={Boolean(err.logo)}
              onChange={(e) => setLogoName(e.target.files?.[0]?.name ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-input/30 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-input/50"
            />
            {logoName ? <p className="text-xs text-muted-foreground">Selected: {logoName}</p> : null}
            <FieldError message={err.logo} />
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
            <Button type="button" disabled={!canAdvance(step)} onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating profile…" : "Create company profile"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
