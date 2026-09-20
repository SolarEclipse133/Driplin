/**
 * Photo limits shared by the browser and the server.
 *
 * Deliberately NOT in store.ts: that file is server-only, and the
 * upload form needs these same numbers to reject a bad file before it
 * is ever sent.
 */

/**
 * Hard ceiling on what we will accept.
 *
 * Two platform limits sit above this. Next.js rejects a server-action
 * body over `serverActions.bodySizeLimit` (see next.config.ts) with a
 * raw 413 that never reaches our code, and Vercel's own request cap is
 * about 4.5 MB. So this has to stay comfortably under both, or a large
 * photo produces an unexplained error page instead of a sentence
 * telling the person what went wrong.
 *
 * In practice almost nothing reaches it: the form downscales before
 * uploading, and a phone photo comes out a few hundred KB.
 */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/**
 * JPEG and PNG embed in the board report. WebP is accepted for
 * convenience but won't render in the PDF, so the report says a photo
 * is on file rather than silently dropping it.
 */
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PDF_EMBEDDABLE_TYPES = ["image/jpeg", "image/png"];

export const PHOTO_ACCEPT_ATTR = ACCEPTED_PHOTO_TYPES.join(",");

export function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
