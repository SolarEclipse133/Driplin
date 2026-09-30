import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  encryptionAvailable,
  isEncrypted,
  secretsMatch,
} from "./secrets";

/**
 * Encryption of the vendor API keys customers entrust to Driplin.
 *
 * These protect against a database dump, a stray backup, or a
 * row-level-security mistake handing out working keys to customers'
 * irrigation accounts. The tests that matter most are the ones proving
 * it FAILS: a wrong key, a tampered ciphertext, or a row lifted from
 * another organization must all refuse rather than quietly work.
 */

const AAD = "vendor_credentials:org-1:rachio";
const SECRET = "rachio-live-key-abc123";
let key: string;

beforeEach(() => {
  key = randomBytes(32).toString("base64");
  process.env.CREDENTIALS_ENCRYPTION_KEY = key;
});
afterEach(() => {
  delete process.env.CREDENTIALS_ENCRYPTION_KEY;
});

describe("round trip", () => {
  it("decrypts back to the original", () => {
    const ct = encryptSecret(SECRET, AAD);
    expect(decryptSecret(ct, AAD)).toEqual({ value: SECRET, legacy: false });
  });

  it("never stores the plaintext", () => {
    expect(encryptSecret(SECRET, AAD)).not.toContain(SECRET);
  });

  it("is versioned and well formed", () => {
    const ct = encryptSecret(SECRET, AAD);
    expect(isEncrypted(ct)).toBe(true);
    expect(ct.split(".")).toHaveLength(4);
  });

  it("uses a fresh IV, so the same input never encrypts alike", () => {
    expect(encryptSecret(SECRET, AAD)).not.toBe(encryptSecret(SECRET, AAD));
  });
});

describe("refuses rather than quietly working", () => {
  it("rejects a tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptSecret(SECRET, AAD).split(".");
    const bytes = Buffer.from(ct, "base64url");
    bytes[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, bytes.toString("base64url")].join("."), AAD)).toThrow();
  });

  it("rejects a row copied into another organization", () => {
    const ct = encryptSecret(SECRET, AAD);
    expect(() => decryptSecret(ct, "vendor_credentials:org-2:rachio")).toThrow();
  });

  it("rejects a row reused for another vendor", () => {
    const ct = encryptSecret(SECRET, AAD);
    expect(() => decryptSecret(ct, "vendor_credentials:org-1:hydrawise")).toThrow();
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptSecret("v1.only.three", AAD)).toThrow();
  });

  it("rejects the wrong key", () => {
    const ct = encryptSecret(SECRET, AAD);
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(ct, AAD)).toThrow();
  });

  it("refuses to encrypt nothing", () => {
    expect(() => encryptSecret("", AAD)).toThrow();
  });
});

describe("key configuration", () => {
  it("reports availability", () => {
    expect(encryptionAvailable()).toBe(true);
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(encryptionAvailable()).toBe(false);
  });

  it("rejects a key of the wrong length", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret(SECRET, AAD)).toThrow(/32 bytes/);
  });

  it("FAILS CLOSED: with no key it will not encrypt at all", () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptSecret(SECRET, AAD)).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
  });
});

describe("rows written before encryption existed", () => {
  it("are readable and flagged for upgrade", () => {
    expect(decryptSecret("plain-old-key", AAD)).toEqual({
      value: "plain-old-key",
      legacy: true,
    });
  });

  it("stay readable even with no key configured", () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(decryptSecret("plain-old-key", AAD).value).toBe("plain-old-key");
  });
});

describe("secretsMatch", () => {
  it.each([
    ["abc", "abc", true],
    ["abc", "abd", false],
    ["abc", "abcd", false],
    ["", "", true],
  ])("%s vs %s -> %s", (a, b, expected) => {
    expect(secretsMatch(a, b)).toBe(expected);
  });
});
