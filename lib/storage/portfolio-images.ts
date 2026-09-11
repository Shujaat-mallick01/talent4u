import "server-only";

import { randomUUID } from "node:crypto";

import { LOGO_ALLOWED_TYPES, LOGO_MAX_BYTES } from "@/lib/validations/recruiter";

import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Portfolio image storage.
 *
 * Same contract as lib/storage/profile-images.ts — self-provisioning public
 * bucket, `${userId}/${uuid}.${ext}` paths, MIME and size validated — with one
 * addition that module does not have and needs: **deletion**.
 *
 * Avatars are replaced rarely, so orphaning the old object was tolerable.
 * Portfolio items are added and removed routinely, and a freelancer who
 * deletes a piece of work reasonably expects the image to stop being served
 * from a public URL. Leaving it would also mean account deletion anonymises
 * the text and leaves the pictures up, which is the sharper end of the same
 * problem.
 *
 * Its own bucket rather than a folder in `avatars`: different lifecycle,
 * different volume, and a size limit that can move independently.
 */

export const PORTFOLIO_BUCKET = "portfolio";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type PortfolioImageResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Validates the file before anything touches storage. Same rules as every
 * other image on a profile, so a person meets one set of limits.
 *
 * KNOWN GAP, inherited deliberately rather than introduced here: this checks
 * the declared MIME type and the size, not the file's magic bytes. A renamed
 * file passes. It matters more here than for avatars — twelve public objects
 * per freelancer instead of one — and is tracked in docs/AUDIT.md §3.
 */
export function validatePortfolioImage(
  file: unknown,
): { ok: true; file: File } | { ok: false; message: string } {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an image for this piece of work." };
  }
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Use a PNG, JPEG or WebP image." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, message: "Keep the image under 2 MB." };
  }
  return { ok: true, file };
}

export async function uploadPortfolioImage(
  userId: string,
  file: File,
): Promise<PortfolioImageResult> {
  // Defence in depth — never trust a type that reached storage.
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Unsupported image type." };
  }

  const supabase = getSupabaseAdmin();

  // An "already exists" error is the normal case after the first call.
  await supabase.storage
    .createBucket(PORTFOLIO_BUCKET, { public: true, fileSizeLimit: LOGO_MAX_BYTES })
    .catch(() => undefined);

  // Namespaced by user, random filename: a re-upload never collides and never
  // serves a stale CDN-cached image.
  const path = `${userId}/${randomUUID()}.${EXT_BY_TYPE[file.type] ?? "bin"}`;

  const { error } = await supabase.storage
    .from(PORTFOLIO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { ok: false, message: "That image didn't upload. Try again." };

  const { data } = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/**
 * The storage path inside a public URL, or null when the URL did not come from
 * this bucket.
 *
 * Parsed rather than trusted. The URL is read back from a database row, and
 * deriving a delete target from it means the one thing that must never happen
 * is deleting outside this bucket — so anything that is not recognisably ours
 * returns null and is left alone.
 */
export function portfolioPathFromUrl(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const marker = `/storage/v1/object/public/${PORTFOLIO_BUCKET}/`;
  const at = new URL(url).pathname.indexOf(marker);
  if (at === -1) return null;
  const path = decodeURIComponent(new URL(url).pathname.slice(at + marker.length));
  // No traversal, and never an empty path (which some APIs read as "the lot").
  if (path.length === 0 || path.includes("..")) return null;
  return path;
}

/**
 * Removes images from storage. Best effort, and deliberately so: the row is
 * already gone by the time this runs, and failing the request because a file
 * could not be deleted would mean the person's item reappears on the next
 * page load. A leftover object is a cost; a resurrected portfolio item is a
 * bug people notice.
 */
export async function deletePortfolioImages(urls: readonly string[]): Promise<number> {
  const paths = urls.map(portfolioPathFromUrl).filter((p): p is string => p !== null);
  if (paths.length === 0) return 0;

  try {
    const { error } = await getSupabaseAdmin().storage.from(PORTFOLIO_BUCKET).remove(paths);
    if (error) {
      console.error(`[storage] portfolio image cleanup failed: ${error.message}`);
      return 0;
    }
    return paths.length;
  } catch (error: unknown) {
    console.error(
      "[storage] portfolio image cleanup threw:",
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}
