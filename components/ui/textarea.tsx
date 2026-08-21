import { cn } from "@/lib/utils";

import { controlBase } from "./field-styles";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        controlBase,
        "min-h-24 px-3 py-2.5 field-sizing-content",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
