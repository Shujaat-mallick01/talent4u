import type { BadgeSpec, BadgeTone } from "@/lib/profile/badges";
import { cn } from "@/lib/utils";

// BRANDGUIDE status pill: 2px radius, 11px uppercase Plex Mono, 1px border,
// tinted background. Status colours are status-only, never decorative, and
// pills never rely on colour alone — the label always carries the meaning.
const TONE: Record<BadgeTone, string> = {
  muted: "border-border bg-muted text-muted-foreground",
  blue: "border-info/40 bg-info/10 text-info",
  gold: "border-warning/40 bg-warning/10 text-warning",
  green: "border-success/40 bg-success/10 text-success",
  red: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Verification / tier / status badge. The label is always shown, never softened. */
export function ProfileBadge({ spec }: { spec: BadgeSpec }) {
  return (
    <span
      title={spec.title}
      className={cn(
        "inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em]",
        TONE[spec.tone],
      )}
    >
      {spec.label}
    </span>
  );
}
