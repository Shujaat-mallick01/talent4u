import { saveJobAction, unsaveJobAction } from "@/app/dashboard/saved/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The bookmark toggle: an outlined mark that fills when saved. Quiet on
 * purpose — saving is a note to self, not a conversion, so it never competes
 * with Apply for the view's one red element.
 */
function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-4", filled ? "fill-current" : "fill-none")}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M6 3h12v18l-6-4.5L6 21z" />
    </svg>
  );
}

export function SaveToggle({
  jobId,
  saved,
  returnTo,
  compact = false,
}: {
  jobId: string;
  saved: boolean;
  /** Where to land back after the redirect — the page the toggle sits on. */
  returnTo: string;
  compact?: boolean;
}) {
  return (
    <form action={saved ? unsaveJobAction : saveJobAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        type="submit"
        size={compact ? "icon-sm" : "sm"}
        variant="ghost"
        aria-label={saved ? "Remove from saved jobs" : "Save this job"}
        title={saved ? "Saved — click to remove" : "Save for later"}
      >
        <BookmarkGlyph filled={saved} />
        {compact ? null : saved ? "Saved" : "Save"}
      </Button>
    </form>
  );
}
