import { cn } from "@/lib/utils";

export type NoticeTone = "success" | "warning" | "error" | "info";

/**
 * The outcome banner every action redirects into.
 *
 * Two things it fixes over the ad-hoc version it replaces:
 *
 * 1. Announcement. Every mutation here is a redirect, so the whole document is
 *    new and a `role="status"` element that was already in the initial HTML is
 *    never announced — screen-reader users got silence on every success and
 *    every failure. `role="alert"` on errors is announced on load; success
 *    keeps `status` so it does not interrupt.
 * 2. Colour alone. A tinted bar carried the entire meaning. Each tone now
 *    leads with a word, so the state survives greyscale and colour blindness.
 */
const TONE: Record<NoticeTone, { classes: string; word: string }> = {
  success: { classes: "border-success/40 bg-success/10 text-success", word: "Done" },
  warning: { classes: "border-warning/40 bg-warning/10 text-warning", word: "Heads up" },
  error: { classes: "border-destructive/40 bg-destructive/10 text-destructive", word: "Not done" },
  info: { classes: "border-info/40 bg-info/10 text-info", word: "Note" },
};

export function Notice({
  tone,
  children,
  className,
}: {
  tone: NoticeTone;
  children: React.ReactNode;
  className?: string;
}) {
  const { classes, word } = TONE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[15px] leading-[22px]",
        classes,
        className,
      )}
    >
      <span className="t-label mt-[3px] shrink-0 opacity-80">{word}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
