/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/**
 * The avatar: a real image when one exists, initials when it does not.
 *
 * Every row on Upwork or LinkedIn leads with a face or a logo, and every row
 * here led with nothing — a wall of text with no visual anchor to scan by.
 * The brand reserves circles for exactly two things, avatars and the orbit
 * dots, so this is the one place a circle is correct.
 *
 * The initials fallback is deterministic and stays inside the brand's
 * neutrals: Mist ground, Ink initials. No random pastel hues — the palette is
 * one red and greys, and forty rainbow circles would bury the one red that is
 * supposed to mean something.
 *
 * Plain <img>, not next/image: avatar URLs are user-supplied remote hosts,
 * and next/image would require allowlisting every one of them in
 * next.config. Sized, lazy, async-decoded.
 */

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-[11px]",
  md: "size-10 text-[13px]",
  lg: "size-[72px] text-[22px]",
} as const;

export type AvatarSize = keyof typeof SIZES;

/** "Ayesha Khan" -> "AK", "Braithwood" -> "BR", "" -> "?" */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "md",
  /** Squared for companies (2px radius), round for people. */
  shape = "person",
  className,
}: {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  shape?: "person" | "company";
  className?: string;
}) {
  const radius = shape === "person" ? "rounded-full" : "rounded-[2px]";

  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 border border-border object-cover", SIZES[size], radius, className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-border bg-muted font-mono font-medium tracking-wide text-foreground select-none",
        SIZES[size],
        radius,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
