import { cn } from "@/lib/utils";

/**
 * A labelled form field: label, optional hint, the control, and an error
 * message wired to it.
 *
 * This exists because the alternative — every form spelling out its own label
 * markup — is how a product ends up with errors that are visually red but
 * announced to nobody. Here the association is structural: `error` sets
 * aria-describedby and aria-invalid on the control via cloneElement-free
 * render props, so a field cannot be styled invalid without also being
 * reported invalid.
 *
 * BRANDGUIDE: "Inputs show validation inline below the field in Deep Red at
 * Inter 400 13px... and the message names the fix rather than restating the
 * error."
 */

export type FieldProps = {
  label: string;
  htmlFor: string;
  /** Shown under the label. Explains the constraint before it is broken. */
  hint?: string;
  error?: string | null;
  /** Marked on the label so required is visible, not just enforced. */
  required?: boolean;
  /** Says so explicitly — "optional" is more useful than an absent asterisk. */
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between gap-3 text-[15px] font-medium leading-none"
      >
        <span>
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              {" *"}
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </span>
        {optional ? (
          <span className="t-label text-muted-foreground">Optional</span>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {children}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[13px] leading-[18px] text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The ids a control inside a Field must carry. Spread onto the input so the
 * description and error are announced, and the invalid state is real rather
 * than cosmetic.
 */
export function fieldControlProps(
  htmlFor: string,
  { hint, error }: { hint?: string; error?: string | null },
): { id: string; "aria-describedby"?: string; "aria-invalid"?: true } {
  const described = [hint ? `${htmlFor}-hint` : null, error ? `${htmlFor}-error` : null]
    .filter(Boolean)
    .join(" ");

  return {
    id: htmlFor,
    ...(described ? { "aria-describedby": described } : {}),
    ...(error ? { "aria-invalid": true as const } : {}),
  };
}
