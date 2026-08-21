import { cn } from "@/lib/utils";

import { checkControl, radioControl } from "./field-styles";

/**
 * Checkbox and radio, and the labelled rows they nearly always appear in.
 *
 * The row wrapper exists because the control alone is 16px — well under the
 * 44px touch minimum. Wrapping control and label in one <label> makes the
 * whole row the hit area, which is what gets a filter list usable on a phone.
 */

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return <input type="checkbox" data-slot="checkbox" className={cn(checkControl, className)} {...props} />;
}

function Radio({ className, ...props }: React.ComponentProps<"input">) {
  return <input type="radio" data-slot="radio" className={cn(radioControl, className)} {...props} />;
}

function ChoiceRow({
  className,
  children,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        // min-h-11 = 44px: the whole row is the target, not the 16px box.
        "flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] leading-[22px]",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export { Checkbox, ChoiceRow, Radio };
