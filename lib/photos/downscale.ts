/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * This is not an optimization. A phone camera produces a 3–5 MB image,
 * and a server action rejects a body that large outright — the person
 * gets a blank error page with nothing to act on. Resizing first keeps
 * every real photo far inside the limit.
 *
 * It also matters for who actually uses this: a landscaper standing in
 * a yard on a cell connection. Sending 300 KB instead of 4 MB is the
 * difference between a tap and a wait.
 */

/** Plenty of detail to read a controller screen; far less data. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

/** Below this, re-encoding costs more than it saves. */
const LEAVE_ALONE_BELOW = 400 * 1024;

/**
 * Returns a smaller JPEG, or the original file when shrinking isn't
 * possible or wouldn't help. Never throws: a photo is optional, and a
 * browser that can't decode the image (an iPhone HEIC that slipped
 * past the accept filter, say) should still be able to submit — the
 * server will judge the original on its own terms.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= LEAVE_ALONE_BELOW) return file;
  if (typeof createImageBitmap !== "function") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    // An already-efficient image can come back larger after
    // re-encoding. Keep whichever is smaller.
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
