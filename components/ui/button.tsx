import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * BRANDGUIDE section 08, "Buttons — one primary per view".
 *
 * Spec: 40px tall, 20px horizontal padding, Inter 600 at 15px, the shared
 * radius token (volume two: 14px, stepped down to --radius-md here so a 40px
 * control does not read as a pill),
 * Signal Red primary that deepens to Deep Red on hover, Ink-bordered
 * secondary, and a visible 2px Info focus ring at 2px offset that is never
 * removed on mouse input. Labels name the outcome — "Send offer", never
 * "Submit".
 *
 * States covered: default, hover, active, focus-visible, disabled, and
 * loading (aria-busy). Disabled drops to 40% opacity with cursor not-allowed,
 * which is the guide's rule rather than Tailwind's default 50%.
 */
const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center gap-2",
    "rounded-md border whitespace-nowrap select-none",
    "font-sans text-[15px] font-semibold leading-none",
    "transition-colors duration-[120ms] ease-out outline-none",
    // The focus ring the accessibility spec makes non-negotiable.
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
    // aria-busy is the loading state: the label stays put and keeps its width
    // so the button never resizes mid-flow.
    "aria-busy:pointer-events-none aria-busy:opacity-70",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /** The one primary per view. Under 10% of the pixels on screen. */
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-destructive active:bg-destructive dark:hover:bg-primary/85",
        /**
         * Ink-filled. The affirmative action INSIDE a record row.
         *
         * The brand gives Ink the "secondary buttons" role, and this variant
         * exists because the alternative breaks a harder rule: a 50-row
         * application inbox with a red Shortlist on every undecided row puts
         * Signal Red far past "under 10% of pixels" and destroys the
         * one-red-element-per-view discipline that makes the accent mean
         * anything. Red stays for the view's single most important action;
         * rows get Ink.
         */
        secondary:
          "border-transparent bg-foreground text-background hover:bg-foreground/85 active:bg-foreground/90",
        /** Ink-bordered, transparent. The quieter half of a decision pair. */
        outline:
          "border-foreground bg-transparent text-foreground hover:bg-muted active:bg-secondary",
        /** Quiet actions inside dense rows. */
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-muted active:bg-secondary",
        /** Reserved for removal and bans, never for a routine action. */
        destructive:
          "border-destructive/40 bg-transparent text-destructive hover:bg-destructive hover:text-primary-foreground active:bg-destructive",
        link: "h-auto border-transparent p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        /** 40px, the brief's command-bar button height. */
        default: "h-10 px-5",
        /** 44px — the touch minimum, for primary actions on mobile-first flows. */
        lg: "h-11 px-6",
        /** 32px, the pointer minimum, for actions inside 88px record rows. */
        sm: "h-8 px-3 text-[14px]",
        icon: "size-10 px-0",
        "icon-sm": "size-8 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
