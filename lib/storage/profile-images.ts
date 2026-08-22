import "server-only";

import { randomUUID } from "node:crypto";

import { LOGO_ALLOWED_TYPES, LOGO_MAX_BYTES } from "@/lib/validations/recruiter";

import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Profile image storage: freelancer avatars, and company logos post-onboarding.
 *
 * Same contract as lib/storage/logos.ts (which onboarding keeps using), with
 * one improvement: the bucket is created if it does not exist, so a fresh
 * Supabase project works without a manual dashboard step. createBucket on an
 * existing bucket errors; that error is the success case and is ignored.
 *
 * Paths are namespaced by user id with a random filename, so a re-upload
 * never collides and never serves a stale CDN-cached image.
 */

export const AVATAR_BUCKET = "avatars";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ImageUploadResult = { ok: true; url: string } | { ok: false; message: string };

/** Validates the shape every profile image shares: type and size. */
export function validateProfileImage(file: unknown): { ok: true; file: File } | { ok: false; message: string } {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an image file first." };
  }
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Use a PNG, JPEG or WebP image." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, message: "Keep the image under 2 MB." };
  }
  return { ok: true, file };
}

async function uploadTo(bucket: string, userId: string, file: File): Promise<ImageUploadResult> {
  // Defence in depth — never trust a type that reached storage.
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Unsupported image type." };
  }

  const supabase = getSupabaseAdmin();

  // Self-provisioning: public-read, capped at the validation limit. An
  // "already exists" error is the normal case after the first call.
  await supabase.storage
    .createBucket(bucket, { public: true, fileSizeLimit: LOGO_MAX_BYTES })
    .catch(() => undefined);

  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  const path = `${userId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return { ok: false, message: "The upload didn't go through. Try again." };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

export function uploadFreelancerAvatar(userId: string, file: File): Promise<ImageUploadResult> {
  return uploadTo(AVATAR_BUCKET, userId, file);
}

/** Post-onboarding logo changes reuse onboarding's bucket, so old URLs live on. */
export function uploadCompanyLogoUpdate(userId: string, file: File): Promise<ImageUploadResult> {
  return uploadTo("company-logos", userId, file);
}
