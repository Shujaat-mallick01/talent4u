"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { submitApplication, type ApplyFormState } from "./actions";

const initialState: ApplyFormState = { fieldErrors: {}, formError: null };

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

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="jobSlug" value={jobSlug} />

      {state.formError ? (
        <p role="alert" className="rounded-[2px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="coverLetter">Cover letter</Label>
        <Textarea
          id="coverLetter"
          name="coverLetter"
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          aria-invalid={Boolean(err.coverLetter)}
          rows={6}
          placeholder="Why you, for this job specifically. Reference the work — generic letters get skipped."
        />
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {coverLetter.trim().length} characters (80 minimum)
        </p>
        <FieldError message={err.coverLetter} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="proposedRateUsd">Your rate (USD, optional)</Label>
        <Input
          id="proposedRateUsd"
          name="proposedRateUsd"
          type="number"
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          aria-invalid={Boolean(err.proposedRateUsd)}
          placeholder="45"
          className="max-w-40"
        />
        <FieldError message={err.proposedRateUsd} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs ${lowQuota ? "font-medium text-warning" : "text-muted-foreground"}`}>
          {state.quotaExhausted
            ? "No free applications left in your rolling 30-day window"
            : remaining === null
              ? "Pro — unlimited applications"
              : `${remaining} of your free applications left in your rolling 30-day window`}
        </p>
        <Button type="submit" disabled={isPending || Boolean(state.quotaExhausted)}>
          {isPending ? "Sending…" : "Apply now"}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] leading-[18px] text-destructive">
      {message}
    </p>
  );
}
