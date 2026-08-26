/**
 * The one control surface every form element shares.
 *
 * BRANDGUIDE: "a 1px Line border that turns 1px Ink on focus plus a 2px Info
 * focus ring", and no shadow ever — a control is a bordered surface, so under
 * the volume-one rule that still holds ("borders or shadow, never both") it
 * does not get elevation. Radius follows the volume-two token. Invalid state
 * uses Deep Red on the border with the message named below the field.
 *
 * The fill is --card rather than --background: the page is now very slightly
 * sunken, and a control filled with the page colour stops looking like
 * something you can type into.
 *
 * Kept in one place so input, textarea, select and the native primitives that
 * still exist in forms cannot drift apart from each other.
 */
export const controlBase = [
  "w-full min-w-0 rounded-md border border-border bg-card",
  "font-sans text-[15px] leading-[22px] text-foreground",
  "transition-colors duration-[120ms] ease-out outline-none",
  "placeholder:text-muted-foreground",
  // Border goes Ink on focus, and the Info ring sits outside it.
  "focus-visible:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:opacity-40",
  "aria-invalid:border-destructive",
].join(" ");

/** 40px — the brief's default control height, on the 8px rhythm. */
export const controlHeight = "h-10 px-3";

/** 44px, for the search input the brief sizes larger, and for touch-first forms. */
export const controlHeightLg = "h-11 px-3.5";

/**
 * Native checkbox and radio, restyled rather than replaced. A real input keeps
 * the label association, the keyboard behaviour, and the form semantics that a
 * div-with-role reimplementation loses.
 */
export const checkControl = [
  "size-4 shrink-0 appearance-none rounded-[5px] border border-foreground bg-card",
  "transition-colors duration-[120ms] ease-out outline-none",
  "checked:border-primary checked:bg-primary",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:opacity-40",
  // The tick is drawn from the border colour so it always contrasts the fill.
  "checked:bg-[length:100%_100%] checked:bg-center checked:bg-no-repeat",
  "checked:[background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3.5 8.5l3 3 6-6' stroke='white' stroke-width='2' stroke-linecap='square'/%3E%3C/svg%3E\")]",
].join(" ");

export const radioControl = [
  "size-4 shrink-0 appearance-none rounded-full border border-foreground bg-card",
  "transition-colors duration-[120ms] ease-out outline-none",
  "checked:border-[5px] checked:border-primary",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:opacity-40",
].join(" ");
