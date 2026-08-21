import { cn } from "@/lib/utils";

/**
 * The dotted orbit, on its own.
 *
 * BRANDGUIDE section 01: "two mirrored arcs, each starting as a heavy dot and
 * tapering inward through seven diminishing steps. It reads as momentum,
 * matching, and a shortlist narrowing to one." It is the only thing this brand
 * owns visually, and until now it appeared nowhere above 24px.
 *
 * Coordinates are lifted exactly from the lockup so the geometry stays the
 * artwork's, not an approximation of it.
 */

/** One arc. The second is this rotated 180° about the optical centre. */
export const ARC = [
  { cx: -170, cy: -95.4, r: 8.4 },
  { cx: -172.3, cy: -130.3, r: 14.1 },
  { cx: -130.5, cy: -162.3, r: 25.5 },
  { cx: -66.3, cy: -160.1, r: 18.1 },
  { cx: -13.2, cy: -141.9, r: 14.2 },
  { cx: 25.9, cy: -121.9, r: 8.1 },
  { cx: 53.3, cy: -106.4, r: 5.5 },
  { cx: 74.8, cy: -90.4, r: 4.8 },
] as const;

export function Orbit({
  className,
  /** Decorative by default — it carries no information the page does not state. */
  label,
  spinning = false,
}: {
  className?: string;
  label?: string;
  spinning?: boolean;
}) {
  return (
    <svg
      viewBox="-200 -200 400 400"
      className={cn(spinning && "animate-[t4u-orbit_1500ms_var(--ease-orbit)_infinite]", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <g fill="currentColor">
        {ARC.map((d, i) => (
          <circle key={`a${i}`} cx={d.cx} cy={d.cy} r={d.r} />
        ))}
        {ARC.map((d, i) => (
          <circle key={`b${i}`} cx={-d.cx} cy={-d.cy} r={d.r} />
        ))}
      </g>
    </svg>
  );
}

/**
 * The loading state the brand specifies: "the orbit rotates a full turn in
 * 1.5s on an ease-in-out curve. Never spin the full lockup."
 */
export function OrbitSpinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex text-primary", className)}>
      <Orbit spinning className="size-full" />
    </span>
  );
}
