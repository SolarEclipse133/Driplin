import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/**
 * Photo proof for manual fixes.
 *
 * Stored in a private bucket under <org_id>/<random>.<ext>, so the
 * storage policies can scope access by company, and a filename can't
 * be guessed from anything in the app. Viewing always goes through a
 * short-lived signed link generated on the server.
 */

export const PHOTO_BUCKET = "fix-photos";
/** Phone photos are a few MB; anything larger is not a photo of a controller. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * JPEG and PNG embed in the board report. WebP is accepted for
 * convenience but won't render in the PDF, so the report says a photo
 * is on file rather than silently dropping it.
 */
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PDF_EMBEDDABLE_TYPES = ["image/jpeg", "image/png"];

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PhotoUpload =
  | { ok: true; path: string; mime: string }
  | { ok: false; error: string }
  | { ok: true; path: null; mime: null };

/**
 * Validate and store an uploaded photo. A missing file is not an
 * error — the photo is optional.
 */
export async function storeFixPhoto(
  supabase: SupabaseClient,
  orgId: string,
  file: File | null
): Promise<PhotoUpload> {
  if (!file || file.size === 0) return { ok: true, path: null, mime: null };

  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: "Photos need to be a JPEG, PNG or WebP image.",
    };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      error: `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
    };
  }

  const path = `${orgId}/${randomUUID()}.${EXTENSIONS[file.type] ?? "jpg"}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return { ok: false, error: "Could not save that photo. Try again." };
  }
  return { ok: true, path, mime: file.type };
}

/** Short-lived link for showing a stored photo. */
export async function signedPhotoUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

/** Raw bytes, for embedding into the board report PDF. */
export async function downloadPhoto(
  supabase: SupabaseClient,
  path: string
): Promise<Buffer | null> {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
