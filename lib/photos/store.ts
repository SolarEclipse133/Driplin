import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  megabytes,
} from "./limits";

/**
 * Photo proof for manual fixes.
 *
 * Stored in a private bucket under <org_id>/<random>.<ext>, so the
 * storage policies can scope access by company, and a filename can't
 * be guessed from anything in the app. Viewing always goes through a
 * short-lived signed link generated on the server.
 */

export const PHOTO_BUCKET = "fix-photos";

// The size and type rules live in ./limits so the upload form can
// apply the same ones before sending anything.
export {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  PDF_EMBEDDABLE_TYPES,
} from "./limits";

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
      error: `That photo is ${megabytes(file.size)}; the limit is ${megabytes(MAX_PHOTO_BYTES)}.`,
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
