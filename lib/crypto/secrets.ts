import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "crypto";

/**
 * Encryption for third-party credentials held on a customer's behalf.
 *
 * WHAT THIS PROTECTS AGAINST: a database dump, a stray backup, a
 * mis-scoped query, or a row-level-security mistake handing out every
 * customer's vendor API keys in the clear. Those are the realistic
 * failures, and until now any one of them would have leaked working
 * keys to customers' irrigation accounts.
 *
 * WHAT IT DOES NOT PROTECT AGAINST: an attacker who can run code on
 * the server, because the server must be able to decrypt to call the
 * vendor API at all. No scheme where the app uses the key can fix
 * that. Claiming otherwise would be worse than the plaintext we are
 * replacing.
 *
 * AES-256-GCM, fresh IV per encryption, authentication tag stored
 * alongside. The org and vendor are bound in as additional
 * authenticated data, so a row copied from one organization to
 * another fails to decrypt instead of silently working.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, each base64url. The version
 * prefix is what makes rotating the algorithm possible later without
 * guessing at what a stored value is.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class SecretKeyError extends Error {}

/**
 * The key comes from the environment and nowhere else — never a file,
 * never the repository, never a default. A missing key is an error,
 * not a reason to fall back to storing plaintext.
 */
function key(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new SecretKeyError(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and add it to the environment (see SETUP.md)."
    );
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new SecretKeyError("CREDENTIALS_ENCRYPTION_KEY is not valid base64.");
  }
  if (buf.length !== KEY_BYTES) {
    throw new SecretKeyError(
      `CREDENTIALS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes; got ${buf.length}.`
    );
  }
  return buf;
}

/** Is the key configured and usable? For surfacing setup problems early. */
export function encryptionAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Does this stored value look like something we encrypted? */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${VERSION}.`);
}

export function encryptSecret(plaintext: string, aad: string): string {
  if (!plaintext) throw new SecretKeyError("Refusing to encrypt an empty secret.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export interface DecryptedSecret {
  value: string;
  /**
   * True when the stored value was still plaintext from before
   * encryption existed. The caller re-writes it encrypted; see
   * lib/controllers/credentials.ts.
   */
  legacy: boolean;
}

export function decryptSecret(stored: string, aad: string): DecryptedSecret {
  if (!isEncrypted(stored)) {
    // Written before this module existed. Accepted on read so the app
    // keeps working during the changeover, and upgraded in place the
    // first time it is used. Once no legacy rows remain this branch
    // should be deleted.
    return { value: stored, legacy: true };
  }

  const parts = stored.split(".");
  if (parts.length !== 4) {
    throw new SecretKeyError("Stored credential is malformed.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  try {
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return { value: plaintext, legacy: false };
  } catch {
    // Wrong key, tampered ciphertext, or a row moved between
    // organizations. All three are the same answer: do not use it.
    throw new SecretKeyError(
      "Stored credential could not be decrypted. The encryption key may have changed."
    );
  }
}

/**
 * Constant-time comparison, for anywhere a secret is checked against a
 * supplied value.
 */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
