import { cn } from "@/lib/utils";

import { IconCheck } from "./icon";

/**
 * Progress through a multi-step form.
 *
 * A ruled row of numbered segments rather than filled pills: the brand is
 * hairlines and one red, and "which step am I on" is exactly the kind of
 * structural information the guide says numbering should encode — this IS a
 * real sequence, so ordinals carry meaning here rather than decorating.
 *
 * Completed steps show a tick, the current one shows a Signal Red rule and an
 * Ink label, and future steps stay quiet. State is marked by rule, weight and
 * a tick, never by colour alone.
 */
export function Steps({
  steps,
  current,
  className,
}: {
  steps: readonly string[];
  /** Zero-based. */
  current: number;
  className?: string;
}) {
  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex gap-px">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex-1">
              <div
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 border-t-2 px-3 py-2",
                  active ? "border-primary" : done ? "border-foreground" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "t-label shrink-0",
                    active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {done ? <IconCheck className="size-3.5" /> : `0${i + 1}`}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate text-[14px]",
                    active
                      ? "font-semibold text-foreground"
                      : done
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                <span className="sr-only">
                  {done ? "(completed)" : active ? "(current step)" : "(not started)"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
