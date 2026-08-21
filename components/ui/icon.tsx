import { cn } from "@/lib/utils";

/**
 * The icon set.
 *
 * BRANDGUIDE section 09: "One family throughout: 1.5px stroke, square cap,
 * 24px grid, monochrome. Inherit text colour. Icons are never red unless they
 * sit inside a red button. No circular backgrounds, no duotone, no filled and
 * outlined mixed in one view. Never use emoji as an icon anywhere."
 *
 * Drawn here rather than pulled from an icon package because the free sets we
 * have installed ship rounded caps, which is the one geometry decision the
 * guide is explicit about — and because twenty paths cost nothing next to a
 * 13,000-export barrel. Every glyph below is on the same 24px grid with the
 * same 1.5 stroke and square caps, so the family is consistent by
 * construction rather than by discipline.
 */

export type IconProps = {
  className?: string;
  /** Give a label only when the icon is the sole content of a control. */
  label?: string;
};

function Svg({ className, label, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={cn("size-5 shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M15.5 15.5 20 20" />
  </Svg>
);

export const IconBriefcase = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" />
    <path d="M9 7V4h6v3M3 12h18" />
  </Svg>
);

export const IconBuilding = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V4h10v16M14 20V9h6v11M3 20h18" />
    <path d="M7 8h3M7 12h3M7 16h3M17 13h0M17 16h0" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.9 3.6-6 8-6s8 2.1 8 6" />
  </Svg>
);

export const IconHandshakeless = (p: IconProps) => (
  // Engagements: two arcs meeting at a confirmed point.
  <Svg {...p}>
    <path d="M3 16c2.5-4 5.5-6 9-6M21 8c-2.5 4-5.5 6-9 6" />
    <path d="M9 13.5 12 10l3 3.5" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 20 6v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

export const IconGauge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 18 16 11" />
    <path d="M3 18h18" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4H5v16h5" />
    <path d="M14 8l4 4-4 4M18 12H9" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8z" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h0" />
  </Svg>
);

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h13l-3 4 3 4H5" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-8 8" />
    <path d="M18 14v6H4V6h6" />
  </Svg>
);
