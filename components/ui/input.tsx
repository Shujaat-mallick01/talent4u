import { cn } from "@/lib/utils";

import { controlBase, controlHeight, controlHeightLg } from "./field-styles";

function Input({
  className,
  type,
  inputSize = "default",
  ...props
}: React.ComponentProps<"input"> & { inputSize?: "default" | "lg" }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlBase,
        inputSize === "lg" ? controlHeightLg : controlHeight,
        // Numeric fields get tabular figures so rates and counts line up with
        // the values they will be rendered as after saving.
        type === "number" && "tabular",
        "file:inline-flex file:border-0 file:bg-transparent file:text-[15px] file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
