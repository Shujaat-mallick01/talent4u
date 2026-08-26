"use client";

import { useState } from "react";

import { OnboardingShell, StepNav } from "@/components/onboarding/onboarding-shell";
import { RoleChoice } from "@/components/auth/role-choice";
import { Notice } from "@/components/ui/notice";

/**
 * The first question after signing up: which product are you here for?
 *
 * It used to sit ON the signup form, above the email field, which asked people
 * to make the one irreversible decision in the product before they had an
 * account or any reason to trust us with the answer. It is now what it should
 * always have been — the first thing the app asks once you are in, in the same
 * shell as every other onboarding question, so signup is only ever an email
 * and a password.
 *
 * No progress bar: the profile wizard that follows counts its own steps, and
 * "Step 1 of 1" followed by "Step 1 of 6" reads as a bug.
 */
export function RoleStep({
  action,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  error?: string | null;
}) {
  const [picked, setPicked] = useState(false);

  return (
    <OnboardingShell
      question="How will you use Talent4u?"
      why={
        <>
          This one cannot be changed later — a different answer would need a second account. Both
          sides are free to start, and neither ever pays a commission.
        </>
      }
      aside={
        <div className="sticky top-24">
          <p className="t-label mb-3 text-muted-foreground">What happens next</p>
          <ol className="surface-card divide-y divide-border overflow-hidden">
            {[
              "A few questions about you, one at a time",
              "Your public page, which you can change whenever you like",
              "Browse, apply or post — all free",
            ].map((line, i) => (
              <li key={line} className="flex gap-4 px-5 py-4">
                <span className="t-data shrink-0 text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[15px] leading-[22px] text-muted-foreground">{line}</span>
              </li>
            ))}
          </ol>
        </div>
      }
    >
      {error ? (
        <Notice tone="error" className="mb-6">
          {error}
        </Notice>
      ) : null}

      {/* onChange on the wrapper rather than on each input: the radios live
          inside RoleChoice, which is shared with the design-system gallery and
          should not have to know it is being gated here. */}
      <form action={action} onChange={() => setPicked(true)}>
        <RoleChoice legend="" />
        <StepNav
          canAdvance={picked}
          hint="Pick one to continue."
          isLast
          onNext={() => {}}
          submitLabel="Continue"
        />
      </form>
    </OnboardingShell>
  );
}
