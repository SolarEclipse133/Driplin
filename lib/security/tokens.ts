import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Link tokens: URLs that are themselves the credential.
 *
 * Driplin hands these to people who have no account — a landscaper who
 * needs to close out one job, an HOA board that wants to see its own
 * compliance. In both cases the link IS the password, so it is treated
 * like one:
 *
 *   - 32 random bytes from the OS CSPRNG, base64url encoded. Not
 *     guessable, not derived from anything in the database.
 *   - Only the SHA-256 hash is stored. A database leak yields hashes,
 *     not working links.
 *   - Compared in constant time, so response timing cannot be used to
 *     narrow one down.
 *
 * The raw token exists exactly once, at the moment it is created, and
 * is handed straight to whoever is sending it. It is never logged.
 */

export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenHashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
