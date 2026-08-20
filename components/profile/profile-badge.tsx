import type { BadgeSpec, BadgeTone } from "@/lib/profile/badges";
import { cn } from "@/lib/utils";

const TONE: Record<BadgeTone, string> = {
  muted: "border-border bg-muted text-muted-foreground",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  gold: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/** Verification / tier badge. The label is always shown, never softened. */
export function ProfileBadge({ spec }: { spec: BadgeSpec }) {
  return (
    <span
      title={spec.title}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[spec.tone],
      )}
    >
      {spec.label}
    </span>
  );
}
