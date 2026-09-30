import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { fakeSupabase } from "@/test/fake-supabase";
import {
  getVendorApiKey,
  saveVendorApiKey,
  upgradeLegacyCredentials,
} from "./credentials";
import { isEncrypted } from "@/lib/crypto/secrets";

/** The one module allowed to touch vendor_credentials.api_key. */

beforeEach(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  delete process.env.CREDENTIALS_ENCRYPTION_KEY;
});

const rowFor = (db: ReturnType<typeof fakeSupabase>, org: string, vendor: string) =>
  db.tables.vendor_credentials.find(
    (r: Record<string, unknown>) => r.org_id === org && r.vendor === vendor
  );

describe("saving", () => {
  it("stores ciphertext, never the key", async () => {
    const db = fakeSupabase({ vendor_credentials: [] });
    const saved = await saveVendorApiKey(db, "org-1", "rachio", "rachio-secret-xyz");
    expect(saved.ok).toBe(true);
    const stored = rowFor(db, "org-1", "rachio")!.api_key as string;
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("rachio-secret-xyz");
  });

  it("reads back as the original", async () => {
    const db = fakeSupabase({ vendor_credentials: [] });
    await saveVendorApiKey(db, "org-1", "rachio", "rachio-secret-xyz");
    expect(await getVendorApiKey(db, "org-1", "rachio")).toBe("rachio-secret-xyz");
  });

  it("FAILS CLOSED: with no key it stores nothing at all", async () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    const db = fakeSupabase({ vendor_credentials: [] });
    const result = await saveVendorApiKey(db, "org-1", "rachio", "must-not-be-stored");
    expect(result.ok).toBe(false);
    expect(db.tables.vendor_credentials).toHaveLength(0);
    if (!result.ok) expect(result.error).toMatch(/CREDENTIALS_ENCRYPTION_KEY/);
  });
});

describe("rows written before encryption existed", () => {
  it("are upgraded in place the first time they are used", async () => {
    const db = fakeSupabase({
      vendor_credentials: [{ org_id: "org-1", vendor: "hydrawise", api_key: "old-plaintext" }],
    });
    expect(await getVendorApiKey(db, "org-1", "hydrawise")).toBe("old-plaintext");
    expect(isEncrypted(rowFor(db, "org-1", "hydrawise")!.api_key as string)).toBe(true);
    expect(await getVendorApiKey(db, "org-1", "hydrawise")).toBe("old-plaintext");
  });

  it("a page render never writes", async () => {
    const db = fakeSupabase({
      vendor_credentials: [{ org_id: "org-1", vendor: "rachio", api_key: "legacy" }],
    });
    expect(await getVendorApiKey(db, "org-1", "rachio", { upgrade: false })).toBe("legacy");
    expect(db.writes).toHaveLength(0);
  });

  it("are left intact when no key is configured", async () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    const db = fakeSupabase({
      vendor_credentials: [{ org_id: "org-1", vendor: "rachio", api_key: "still-plain" }],
    });
    expect(await getVendorApiKey(db, "org-1", "rachio")).toBe("still-plain");
    expect(rowFor(db, "org-1", "rachio")!.api_key).toBe("still-plain");
  });
});

describe("the nightly sweep", () => {
  // The lazy upgrade only fires when a key is USED, and a key belonging
  // to an account with no connected hardware never is. Without this,
  // "credentials are encrypted" would be true only of rows that happen
  // to get read.
  it("converts every plaintext row across every organization", async () => {
    const db = fakeSupabase({
      vendor_credentials: [
        { id: "1", org_id: "org-A", vendor: "rachio", api_key: "plain-a" },
        { id: "2", org_id: "org-A", vendor: "hydrawise", api_key: "plain-b" },
        { id: "3", org_id: "org-B", vendor: "rachio", api_key: "plain-c" },
      ],
    });
    const result = await upgradeLegacyCredentials(db);
    expect(result).toEqual({ upgraded: 3, failed: 0, skipped: null });
    expect(db.tables.vendor_credentials.every((r: Record<string, unknown>) => isEncrypted(r.api_key as string))).toBe(true);
  });

  it("each row still decrypts to its own value under its own org", async () => {
    const db = fakeSupabase({
      vendor_credentials: [
        { id: "1", org_id: "org-A", vendor: "rachio", api_key: "plain-a" },
        { id: "2", org_id: "org-B", vendor: "rachio", api_key: "plain-c" },
      ],
    });
    await upgradeLegacyCredentials(db);
    expect(await getVendorApiKey(db, "org-A", "rachio")).toBe("plain-a");
    expect(await getVendorApiKey(db, "org-B", "rachio")).toBe("plain-c");
  });

  it("is a no-op on a second run", async () => {
    const db = fakeSupabase({
      vendor_credentials: [{ id: "1", org_id: "org-A", vendor: "rachio", api_key: "plain-a" }],
    });
    await upgradeLegacyCredentials(db);
    expect(await upgradeLegacyCredentials(db)).toEqual({ upgraded: 0, failed: 0, skipped: null });
  });

  it("skips with a reason rather than failing the nightly run", async () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    const db = fakeSupabase({
      vendor_credentials: [{ id: "1", org_id: "o", vendor: "rachio", api_key: "still-plain" }],
    });
    expect(await upgradeLegacyCredentials(db)).toEqual({
      upgraded: 0,
      failed: 0,
      skipped: "no encryption key configured",
    });
    expect(db.tables.vendor_credentials[0].api_key).toBe("still-plain");
  });
});

describe("cross-organization isolation", () => {
  it("a row copied into another org refuses to decrypt", async () => {
    const db = fakeSupabase({ vendor_credentials: [] });
    await saveVendorApiKey(db, "org-A", "rachio", "org-A-key");
    const stolen = rowFor(db, "org-A", "rachio")!.api_key;
    db.tables.vendor_credentials.push({ org_id: "org-B", vendor: "rachio", api_key: stolen });
    await expect(getVendorApiKey(db, "org-B", "rachio")).rejects.toThrow();
  });
});
