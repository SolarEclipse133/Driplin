/**
 * Work-order link tokens.
 *
 * The link Driplin sends a landscaper IS the credential — anyone
 * holding it can mark that one job done. So it is treated like a
 * password:
 *
 *   - 32 random bytes from the OS CSPRNG, base64url encoded. Not
 *     guessable and not derived from anything in the database.
 *   - Only the SHA-256 hash is stored. A database leak yields hashes,
 *     not working links.
 *   - Scoped to ONE work order. It is not a login: the page it opens
 *     shows one property's one task and nothing else.
 *   - Expires, and stops working once the job is completed.
 *
 * The raw token exists exactly once, in the moment it is created, and
 * is handed straight to the person sending it. It is never logged.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** How long a work-order link stays usable. */
export const WORK_ORDER_TTL_DAYS = 14;

export function generateWorkOrderToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashWorkOrderToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two hashes, so response timing can't be
 * used to narrow down a token.
 */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function workOrderExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + WORK_ORDER_TTL_DAYS * 24 * 3600 * 1000);
}

/** The full link handed to a vendor. */
export function workOrderUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/fix/${token}`;
}
