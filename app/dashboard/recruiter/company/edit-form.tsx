"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/geo/countries";

import { saveCompanyProfile, type CompanyEditState } from "./actions";

const initialState: CompanyEditState = { fieldErrors: {}, formError: null };

/** Mirrors companyProfileEditSchema. The server is the authority. */
const DESCRIPTION_MIN = 40;
const DESCRIPTION_MAX = 2000;

const HINTS = {
  companyName: "The name that appears on every job you post.",
  websiteUrl: "https://acme.com",
  description: `${DESCRIPTION_MIN} to ${DESCRIPTION_MAX.toLocaleString("en-US")} characters, or leave it empty. What the company does and who works there.`,
  country: "Where the company is based. It sets your price band.",
} as const;

export type CompanyProfileInitial = {
  companyName: string;
  websiteUrl: string | null;
  description: string | null;
  country: string;
};

export function CompanyProfileEditForm({ initial }: { initial: CompanyProfileInitial }) {
  const [state, formAction, isPending] = useActionState(saveCompanyProfile, initialState);

  // Prefilled from the current company, so saving one change does not blank
  // the other three.
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [country, setCountry] = useState(initial.country);

  const err = state.fieldErrors;
  const descriptionLength = description.trim().length;

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.formError ? <Notice tone="error">{state.formError}</Notice> : null}

      <Field
        label="Company name"
        htmlFor="companyName"
        hint={HINTS.companyName}
        error={err.companyName}
        required
      >
        <Input
          {...fieldControlProps("companyName", {
            hint: HINTS.companyName,
            error: err.companyName,
          })}
          name="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          autoComplete="organization"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Website"
          htmlFor="websiteUrl"
          hint={HINTS.websiteUrl}
          error={err.websiteUrl}
          optional
        >
          <Input
            {...fieldControlProps("websiteUrl", { hint: HINTS.websiteUrl, error: err.websiteUrl })}
            name="websiteUrl"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            inputMode="url"
            autoComplete="url"
          />
        </Field>

        <Field label="Country" htmlFor="country" hint={HINTS.country} error={err.country} required>
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
      </div>

      <Field
        label="About the company"
        htmlFor="description"
        hint={HINTS.description}
        error={err.description}
        optional
      >
        <Textarea
          {...fieldControlProps("description", {
            hint: HINTS.description,
            error: err.description,
          })}
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          className="min-h-48"
          placeholder="What you build, how the team works, and what a freelancer's first month looks like."
        />
        <p
          aria-hidden
          className={`flex items-baseline justify-between gap-3 ${
            descriptionLength > DESCRIPTION_MAX
              ? "text-destructive"
              : descriptionLength > 0 && descriptionLength < DESCRIPTION_MIN
                ? "text-muted-foreground"
                : "text-success"
          }`}
        >
          <span className="t-label">
            {descriptionLength === 0
              ? "Empty is fine"
              : descriptionLength < DESCRIPTION_MIN
                ? `${DESCRIPTION_MIN - descriptionLength} to go`
                : descriptionLength > DESCRIPTION_MAX
                  ? `${(descriptionLength - DESCRIPTION_MAX).toLocaleString("en-US")} over the limit`
                  : "Long enough"}
          </span>
          <span className="t-data">
            {descriptionLength.toLocaleString("en-US")} /{" "}
            {DESCRIPTION_MAX.toLocaleString("en-US")}
          </span>
        </p>
      </Field>

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
