"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";

import { submitApplication, type ApplyFormState } from "./actions";

const initialState: ApplyFormState = { fieldErrors: {}, formError: null };

/** Mirrors applyToJobSchema. The server is the authority; this is UX only. */
const MIN_LETTER = 80;
const MAX_LETTER = 3000;

const LETTER_HINT = "80 to 3,000 characters. Name the work, not yourself in general.";

export function ApplyForm({
  jobSlug,
  remaining,
}: {
  jobSlug: string;
  /** Applications left this window; null = unlimited (Pro). */
  remaining: number | null;
}) {
  const [state, formAction, isPending] = useActionState(submitApplication, initialState);
  const [coverLetter, setCoverLetter] = useState("");
  const [rate, setRate] = useState("");

  const err = state.fieldErrors;
  const lowQuota = remaining !== null && remaining <= 3;

  // Counted the way the server counts it: trimmed. Otherwise a letter of
  // trailing newlines reads as long enough here and is refused there.
  const length = coverLetter.trim().length;
  const tooShort = length < MIN_LETTER;
  const tooLong = length > MAX_LETTER;
  const lengthNote = tooLong
    ? `${(length - MAX_LETTER).toLocaleString("en-US")} over the limit`
    : tooShort
      ? `${MIN_LETTER - length} to go`
      : "Long enough to send";

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="jobSlug" value={jobSlug} />

      {state.formError ? <Notice tone="error">{state.formError}</Notice> : null}

      <Field
        label="Cover letter"
        htmlFor="coverLetter"
        hint={LETTER_HINT}
        error={err.coverLetter}
        required
      >
        <Textarea
          {...fieldControlProps("coverLetter", { hint: LETTER_HINT, error: err.coverLetter })}
          name="coverLetter"
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={10}
          className="min-h-56"
          placeholder="Why you, for this job specifically. Reference the work — generic letters get skipped."
        />
        {/* Progress toward the range, in words and in figures, so the state
            survives greyscale. Not a live region: an announcement per
            keystroke would drown the field itself. */}
        <p
          aria-hidden
          className={`flex items-baseline justify-between gap-3 ${
            tooLong ? "text-destructive" : tooShort ? "text-muted-foreground" : "text-success"
          }`}
        >
          <span className="t-label">{lengthNote}</span>
          <span className="t-data">
            {length.toLocaleString("en-US")} / {MAX_LETTER.toLocaleString("en-US")}
          </span>
        </p>
      </Field>

      <Field
        label="Your rate"
        htmlFor="proposedRateUsd"
        hint="Whole US dollars. Leave it blank to agree the rate later."
        error={err.proposedRateUsd}
        optional
      >
        <Input
          {...fieldControlProps("proposedRateUsd", {
            hint: "Whole US dollars. Leave it blank to agree the rate later.",
            error: err.proposedRateUsd,
          })}
          name="proposedRateUsd"
          type="number"
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="45"
          className="max-w-40"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-4">
        <p
          className={`text-[13px] leading-[18px] ${
            lowQuota ? "font-medium text-warning" : "text-muted-foreground"
          }`}
        >
          {state.quotaExhausted
            ? "No free applications left in your rolling 30-day window"
            : remaining === null
              ? "Pro — unlimited applications"
              : `${remaining} of your free applications left in your rolling 30-day window`}
        </p>
        <Button
          type="submit"
          size="lg"
          aria-busy={isPending || undefined}
          disabled={isPending || Boolean(state.quotaExhausted)}
        >
          {isPending ? "Sending…" : "Send application"}
        </Button>
      </div>
    </form>
  );
}
