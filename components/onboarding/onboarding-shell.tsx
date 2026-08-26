"use client";

import { Button } from "@/components/ui/button";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * One question, one screen.
 *
 * Onboarding used to be three long steps: the first asked for a name, a
 * headline AND a 120-character bio before anything else happened. That is a
 * wall at the exact moment someone has least invested, and the heading above
 * it said "Set up your profile" — a label for the whole form, not a question
 * anyone could answer.
 *
 * The shape here is the one every good onboarding converges on:
 *
 *   - The HEADING IS THE QUESTION. You read one sentence and you know what is
 *     being asked. "What should we call you?", not "About you".
 *   - One thing per screen. Two inputs only when they are genuinely one
 *     question (a country and the timezone inside it).
 *   - Progress is visible and finite, so nobody is answering into a void.
 *   - Forward is blocked until the answer is usable, and the button says so by
 *     being disabled rather than by failing after the fact.
 *   - A panel on the right earns its space by showing what is being BUILT —
 *     the page a company will actually read — instead of decoration.
 *
 * Presentation only. Every step is a `hidden` fieldset in ONE form that
 * submits once, so there is a single Server Action, a single Zod schema, and
 * no half-written rows in the database. The client gating is convenience; the
 * server still validates the lot.
 */
export function OnboardingShell({
  stepIndex,
  stepCount,
  question,
  why,
  onBack,
  aside,
  children,
}: {
  /** Zero-based. Omit both, with stepCount, for a standalone question. */
  stepIndex?: number;
  /** Omit for a question that is not part of a counted sequence. */
  stepCount?: number;
  /** The question itself, phrased as a question. */
  question: string;
  /** One line on why it is being asked, or what a good answer looks like. */
  why?: React.ReactNode;
  /** Omitted on the first step, where there is nowhere to go back to. */
  onBack?: () => void;
  /** The live preview. Hidden below the split — on a phone the form is the job. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  // A standalone question shows no counter and no bar: "Step 1 of 1" above a
  // single question reads as a bug, not as progress.
  const counted =
    typeof stepIndex === "number" && typeof stepCount === "number" && stepCount > 1
      ? { index: stepIndex, count: stepCount }
      : null;

  return (
    <div className="mx-auto grid w-full max-w-[var(--container-marketing)] grid-cols-1 gap-x-16 gap-y-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:py-16">
      <div className="min-w-0">
        <div className={cn("flex items-center gap-3", !onBack && counted === null && "hidden")}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <IconArrowLeft className="size-4" />
              <span className="sr-only">Back to the previous question</span>
            </button>
          ) : null}
          {counted ? (
            <p className="t-label text-muted-foreground">
              Step {counted.index + 1} of {counted.count}
            </p>
          ) : null}
        </div>

        {/* Finite and countable, in Ink. Signal Red is spent on the one button
            that moves this forward, not on a decoration that is always there. */}
        {counted ? (
          <div
            className="mt-3 flex gap-1"
            role="img"
            aria-label={`Step ${counted.index + 1} of ${counted.count}`}
          >
            {Array.from({ length: counted.count }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= counted.index ? "bg-foreground" : "bg-border",
                )}
              />
            ))}
          </div>
        ) : null}

        <h1 className={cn("t-display-2", counted || onBack ? "mt-8" : "")}>{question}</h1>
        {why ? (
          <p className="measure mt-3 text-[16px] leading-[26px] text-muted-foreground">{why}</p>
        ) : null}

        <div className="mt-8">{children}</div>
      </div>

      {aside ? <aside className="hidden lg:block">{aside}</aside> : null}
    </div>
  );
}

/**
 * The forward control.
 *
 * Disabled until the answer on screen is usable — the same reason Acquire's
 * "Next" sits greyed until you pick something. A button that looks ready and
 * then rejects you is worse than one that plainly is not ready yet, so the
 * reason is spelled out beside it rather than left to be guessed at.
 */
export function StepNav({
  canAdvance,
  hint,
  isLast,
  isPending,
  onNext,
  submitLabel,
  onSkip,
}: {
  canAdvance: boolean;
  /** Shown when forward is blocked. Names what is missing. */
  hint?: string;
  isLast: boolean;
  isPending?: boolean;
  onNext: () => void;
  submitLabel: string;
  /** Only for steps that are genuinely optional. */
  onSkip?: () => void;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
      {isLast ? (
        <Button type="submit" size="lg" disabled={!canAdvance || isPending}>
          {isPending ? "Creating your profile…" : submitLabel}
        </Button>
      ) : (
        <Button type="button" size="lg" disabled={!canAdvance} onClick={onNext}>
          Next
          <IconArrowRight />
        </Button>
      )}

      {onSkip && !isLast ? (
        <Button type="button" variant="ghost" size="lg" onClick={onSkip}>
          Skip for now
        </Button>
      ) : null}

      {!canAdvance && hint ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
