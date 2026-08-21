import { cn } from "@/lib/utils";

import { controlBase, controlHeight } from "./field-styles";

/**
 * A native select, restyled. Deliberately not a custom listbox: the native
 * control gives us keyboard behaviour, type-ahead, and the platform's own
 * picker on touch — all of which a div-based reimplementation has to rebuild
 * and usually rebuilds worse.
 *
 * The chevron is an inline SVG background so the control needs no wrapper
 * element and no icon dependency.
 */
const CHEVRON =
  "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23585860' stroke-width='1.5' stroke-linecap='square'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      style={{ backgroundImage: CHEVRON }}
      className={cn(
        controlBase,
        controlHeight,
        "cursor-pointer appearance-none bg-[length:16px_16px] bg-[position:right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
