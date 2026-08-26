import { cn } from "@/lib/utils";

/**
 * The TALENT4U lockups, exactly as issued.
 *
 * Geometry is copied verbatim from BRANDGUIDE/talent4u-logo-*.svg — the same
 * files that ship in public/brand. They are inlined as components rather than
 * <img> so the mark inherits the theme: the orbit takes --primary (Signal Red,
 * Ember on Ink) and the wordmark currentColor, which is what the guideline's
 * reversal rule asks for. Nothing here is redrawn. The wordmark is artwork,
 * never live text.
 *
 * Volume one, section 02: FOUR approved configurations, and "pick by available
 * width, not by preference. If two would fit, use the one earlier in this
 * list." Section 03 gives the minimum each one may be rendered at:
 *
 *   Primary          120px wide   default — sites, decks, signage, email
 *   Stacked           88px wide   narrow or square: splash, tote, badge
 *   Symbol            48px        where the NAME IS ALREADY PRESENT
 *   Compact symbol    16px        below 48px; five heavier dots per arc
 *
 * The minimums are the whole point of this file. The header and footer were
 * rendering Primary at about 40px wide — a third of its floor — which put the
 * wordmark at roughly five pixels tall and turned the logo into a smudge on
 * every page of the site. Sizes are therefore stated in WIDTH here, because
 * that is the axis the guideline constrains.
 *
 * Do not add a fifth arrangement. A horizontal orbit-then-wordmark lockup is
 * an obvious thing to reach for at small sizes and it is not part of this
 * system; that is what the compact symbol is for.
 */

/** The eight-dot arc of the full orbit. The second arc is this, rotated 180°. */
const ARC_8 = [
  { cx: -170.0, cy: -95.4, r: 8.4 },
  { cx: -172.3, cy: -130.3, r: 14.1 },
  { cx: -130.5, cy: -162.3, r: 25.5 },
  { cx: -66.3, cy: -160.1, r: 18.1 },
  { cx: -13.2, cy: -141.9, r: 14.2 },
  { cx: 25.9, cy: -121.9, r: 8.1 },
  { cx: 53.3, cy: -106.4, r: 5.5 },
  { cx: 74.8, cy: -90.4, r: 4.8 },
] as const;

/** Five heavier dots. Below 48px the tail of the eight-dot arc closes up. */
const ARC_5 = [
  { cx: -158.1, cy: -119.2, r: 16.0 },
  { cx: -121.6, cy: -151.2, r: 26.0 },
  { cx: -60.8, cy: -154.4, r: 20.5 },
  { cx: -9.6, cy: -137.7, r: 15.0 },
  { cx: 29.5, cy: -118.4, r: 10.0 },
] as const;

const WORDMARK =
  "M3.0 -82.3V-100.0H84.3V-82.3H54.0V0.0H33.4V-82.3Z M87.9 0.0 123.0 -100.0H149.6L184.7 0.0H161.8L146.1 -48.7Q143.2 -58.2 140.2 -68.4Q137.1 -78.6 133.6 -91.5H139.2Q135.6 -78.6 132.5 -68.4Q129.5 -58.2 126.4 -48.7L110.2 0.0ZM110.2 -21.8V-38.3H162.5V-21.8Z M192.8 0.0V-100.0H213.5V-17.7H258.9V0.0Z M269.3 0.0V-100.0H341.1V-82.3H290.0V-59.2H337.2V-41.9H290.0V-17.7H341.1V0.0Z M352.9 0.0V-100.0H374.7L406.8 -48.9Q408.3 -46.5 410.5 -42.6Q412.8 -38.6 415.3 -34.1Q417.9 -29.5 420.1 -25.3L417.8 -20.0Q417.6 -24.6 417.4 -30.5Q417.2 -36.5 417.1 -41.9Q417.0 -47.4 417.0 -50.5V-100.0H437.7V0.0H415.8L386.7 -46.3Q384.9 -49.2 382.2 -53.8Q379.4 -58.5 376.0 -64.5Q372.6 -70.4 369.0 -77.0L372.6 -79.4Q373.0 -72.0 373.2 -65.5Q373.4 -59.0 373.5 -54.1Q373.5 -49.2 373.5 -46.4V0.0Z M448.1 -82.3V-100.0H529.4V-82.3H499.1V0.0H478.5V-82.3Z M536.3 -21.6V-37.5L580.4 -100.0H593.3V-80.3H586.1L556.2 -37.7V-37.6H618.7V-21.6ZM586.2 0.0V-26.4V-33.6V-100.0H605.7V0.0Z M671.1 1.6Q658.6 1.6 649.4 -3.0Q640.1 -7.6 635.0 -15.8Q629.9 -24.0 629.9 -34.8V-100.0H650.1V-36.5Q650.1 -30.6 652.7 -26.1Q655.3 -21.5 660.0 -18.9Q664.7 -16.3 671.1 -16.3Q677.5 -16.3 682.2 -18.9Q686.9 -21.5 689.5 -26.0Q692.1 -30.6 692.1 -36.5V-100.0H712.3V-34.8Q712.3 -24.0 707.2 -15.8Q702.1 -7.6 692.8 -3.0Q683.6 1.6 671.1 1.6Z";

/** The "4U" that sits inside the ring on both symbol lockups. */
const GLYPH_4U =
  "M3.9 -21.6V-37.5L47.9 -100.0H60.9V-80.3H53.7L23.8 -37.7V-37.6H86.3V-21.6ZM53.8 0.0V-26.4V-33.6V-100.0H73.2V0.0Z";

function Arcs({ dots }: { dots: readonly { cx: number; cy: number; r: number }[] }) {
  return (
    <g fill="var(--primary)">
      {dots.map((d, i) => (
        <circle key={`a${i}`} cx={d.cx} cy={d.cy} r={d.r} />
      ))}
      {dots.map((d, i) => (
        <circle key={`b${i}`} cx={-d.cx} cy={-d.cy} r={d.r} />
      ))}
    </g>
  );
}

/**
 * Primary. The default everywhere the name is not already on screen.
 *
 * MINIMUM WIDTH 120px. The box is 813×480, so 120px wide is about 71px tall —
 * size it with a width class (`w-[120px]`), never a small height class, which
 * is precisely how it ended up at 5px tall before.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-407 -240 813 480"
      role="img"
      aria-label="TALENT4U"
      className={cn("h-auto", className)}
    >
      <Arcs dots={ARC_8} />
      <g transform="translate(-357.6,50.0)" fill="currentColor">
        <path d={WORDMARK} />
      </g>
    </svg>
  );
}

/**
 * Stacked: a smaller orbit with the "4U" inside it, sitting ABOVE the
 * wordmark. Narrow or square spaces. MINIMUM WIDTH 88px.
 *
 * Its orbit is its own artwork, not the primary's scaled down — the dots are
 * at different coordinates and different radii.
 */
const ARC_8_STACKED = [
  { cx: -119.0, cy: -66.8, r: 5.9 },
  { cx: -120.6, cy: -91.2, r: 9.9 },
  { cx: -91.4, cy: -113.6, r: 17.8 },
  { cx: -46.4, cy: -112.1, r: 12.7 },
  { cx: -9.2, cy: -99.3, r: 9.9 },
  { cx: 18.1, cy: -85.3, r: 5.7 },
  { cx: 37.3, cy: -74.5, r: 3.8 },
  { cx: 52.3, cy: -63.3, r: 3.4 },
] as const;

export function LogoStacked({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-407 -183 813 509"
      role="img"
      aria-label="TALENT4U"
      className={cn("h-auto", className)}
    >
      <Arcs dots={ARC_8_STACKED} />
      <g transform="translate(-49.6,55.0) scale(1.1)" fill="currentColor">
        <path d={GLYPH_4U} />
      </g>
      <g transform="translate(-357.6,274.0)" fill="currentColor">
        <path d={WORDMARK} />
      </g>
    </svg>
  );
}

/**
 * Symbol. Only where the name is already present — avatars, favicons, app
 * tile. MINIMUM 48px. Below that the eight-dot tail closes up: use
 * LogoSymbolCompact.
 */
export function LogoSymbol({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="-216 -218 433 436"
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <Arcs dots={ARC_8} />
      <g transform="translate(-71.3,79.0) scale(1.58)" fill="currentColor">
        <path d={GLYPH_4U} />
      </g>
    </svg>
  );
}

/** Compact symbol. 16px up to 48px. Five heavier dots per arc. */
export function LogoSymbolCompact({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="-200 -203 400 406"
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <Arcs dots={ARC_5} />
      <g transform="translate(-75.8,84.0) scale(1.68)" fill="currentColor">
        <path d={GLYPH_4U} />
      </g>
    </svg>
  );
}
