import "server-only";

import { randomUUID } from "node:crypto";

import { LOGO_ALLOWED_TYPES } from "@/lib/validations/recruiter";

import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Company logo storage. The bucket is created out of band (Supabase dashboard)
 * and must be public-read so logos render on the public company pages. Uploads
 * go through the admin client; callers must authorize the user first.
 */

export const LOGO_BUCKET = "company-logos";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type LogoUploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

/**
 * Uploads a validated logo for `userId` and returns its public URL. The path
 * is namespaced by user id, and the filename is random so a re-upload never
 * collides or serves a stale cached image.
 */
export async function uploadCompanyLogo(userId: string, file: File): Promise<LogoUploadResult> {
  // Defence in depth: the caller validated already, but never trust a type
  // that reached storage.
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Unsupported image type." };
  }

  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  const path = `${userId}/${randomUUID()}.${ext}`;

  const supabase = getSupabaseAdmin();
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return { ok: false, message: "We couldn't upload your logo. Please try again." };
  }

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
