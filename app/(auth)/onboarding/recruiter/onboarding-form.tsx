"use client";

import { useActionState, useState } from "react";

import { CompanyPreview } from "@/components/onboarding/company-preview";
import { OnboardingShell, StepNav } from "@/components/onboarding/onboarding-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/geo/countries";
import { LOGO_ACCEPT } from "@/lib/validations/recruiter";

import { submitRecruiterOnboarding, type RecruiterOnboardingState } from "./actions";

const initialRecruiterOnboardingState: RecruiterOnboardingState = {
  fieldErrors: {},
  formError: null,
};

/**
 * Five questions, matching the freelancer flow question for question.
 *
 * Two of them are genuinely optional and say so with a Skip, because pretending
 * a registration number is required at signup would cost us companies who do
 * not have one to hand — and it verifies nothing on its own anyway.
 *
 * One form, one submit, one Zod schema. Steps are `hidden` fieldsets.
 */
const STEP_COUNT = 5;

const FIELD_STEP: Record<string, number> = {
  companyName: 0,
  country: 1,
  companyDomain: 2,
  websiteUrl: 2,
  description: 3,
  logo: 3,
  registrationNo: 4,
  linkedinUrl: 4,
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] leading-[18px] text-destructive">
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  /** Swaps the preview's blob URL, releasing the one it replaces. */
  const pickLogo = (file: File | null) => {
    setLogoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setLogoName(file?.name ?? null);
  };

  // On any server-error return, jump to the earliest step carrying an error
  // (adjust-on-render). React 19 resets the uncontrolled file input when the
  // action completes, so also clear the label — otherwise it keeps claiming a
  // logo is attached that the browser has already dropped, and the next submit
  // would silently create a profile with no logo.
  const [handledErrors, setHandledErrors] = useState(state.fieldErrors);
  if (state.fieldErrors !== handledErrors) {
    setHandledErrors(state.fieldErrors);
    pickLogo(null);
    const keys = Object.keys(state.fieldErrors);
    if (keys.length > 0) setStep(Math.min(...keys.map((k) => FIELD_STEP[k] ?? 0)));
  }

  const err = state.fieldErrors;

  const GATES: { ok: boolean; hint: string; optional?: boolean }[] = [
    { ok: companyName.trim().length >= 2, hint: "At least two characters." },
    { ok: country !== "", hint: "Pick a country." },
    { ok: true, hint: "", optional: true },
    { ok: true, hint: "", optional: true },
    { ok: true, hint: "" },
  ];

  const QUESTIONS: { question: string; why: React.ReactNode }[] = [
    {
      question: "What is your company called?",
      why: "The name that appears on every role you post. Freelancers will search for it, so use the one they would recognise.",
    },
    {
      question: "Where is the company based?",
      why: "Shown on your page, and it sets the price band if you ever subscribe. Nothing is charged today.",
    },
    {
      question: "How can people find you?",
      why: "A company domain and a website are the first two things we check when you ask to be verified. Optional now.",
    },
    {
      question: "What does your company do?",
      why: "This is your public page. A few honest sentences beat a paragraph of adjectives — and a logo makes a post look like it came from a real company.",
    },
    {
      question: "Anything we can verify you with?",
      why: "Optional, and nothing here verifies you on its own. Having it on file just means verification is a formality later instead of a fresh conversation.",
    },
  ];

  const isLast = step === STEP_COUNT - 1;
  const current = QUESTIONS[step];
  const next = () => setStep((s) => Math.min(STEP_COUNT - 1, s + 1));

  return (
    <OnboardingShell
      stepIndex={step}
      stepCount={STEP_COUNT}
      question={current.question}
      why={current.why}
      onBack={step === 0 ? undefined : () => setStep((s) => Math.max(0, s - 1))}
      aside={
        <CompanyPreview
          companyName={companyName}
          description={description}
          country={country}
          websiteUrl={websiteUrl}
          logoUrl={logoUrl}
        />
      }
    >
      {state.formError ? (
        <Notice tone="error" className="mb-6">
          {state.formError}
        </Notice>
      ) : null}

      <form action={formAction} noValidate encType="multipart/form-data">
        {/* 1 — Name */}
        <fieldset hidden={step !== 0}>
          <Label htmlFor="companyName" className="sr-only">
            Company name
          </Label>
          <Input
            id="companyName"
            name="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            aria-invalid={Boolean(err.companyName)}
            placeholder="Acme Commerce Ltd"
            autoComplete="organization"
            inputSize="lg"
            className="max-w-md"
          />
          <FieldError message={err.companyName} />
          <p className="t-label mt-4 text-muted-foreground">Signed in as {email}</p>
        </fieldset>

        {/* 2 — Country */}
        <fieldset hidden={step !== 1}>
          <Label htmlFor="country" className="sr-only">
            Country
          </Label>
          <Select
            id="country"
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-invalid={Boolean(err.country)}
            className="max-w-sm"
          >
            <option value="">Select…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
          <FieldError message={err.country} />
        </fieldset>

        {/* 3 — Domain and website */}
        <fieldset hidden={step !== 2} className="grid max-w-lg gap-4 sm:grid-cols-2">
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
        </fieldset>

        {/* 4 — Description and logo */}
        <fieldset hidden={step !== 3} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="description" className="sr-only">
              About the company
            </Label>
            <Textarea
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(err.description)}
              rows={6}
              placeholder="We build subscription commerce for skincare brands. We hire freelance developers and designers for six- to twelve-week projects, and we pay on completion of each milestone."
            />
            <FieldError message={err.description} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="logo">Company logo — PNG, JPEG or WebP, up to 2 MB</Label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept={LOGO_ACCEPT}
              aria-invalid={Boolean(err.logo)}
              onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
              className="block w-full max-w-md text-[14px] file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-foreground file:bg-transparent file:px-3 file:text-[14px] file:font-semibold"
            />
            {logoName ? (
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                Attached: {logoName}
              </p>
            ) : null}
            <FieldError message={err.logo} />
          </div>
        </fieldset>

        {/* 5 — Verification evidence */}
        <fieldset hidden={step !== 4} className="max-w-lg space-y-4">
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
        </fieldset>

        <StepNav
          canAdvance={GATES[step].ok}
          hint={GATES[step].hint}
          isLast={isLast}
          isPending={isPending}
          onNext={next}
          onSkip={GATES[step].optional ? next : undefined}
          submitLabel="Create company profile"
        />
      </form>
    </OnboardingShell>
  );
}
