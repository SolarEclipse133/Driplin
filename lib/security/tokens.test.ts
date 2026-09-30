import { describe, expect, it } from "vitest";
import { generateLinkToken, hashLinkToken, tokenHashesMatch } from "./tokens";

/**
 * Link tokens for people with no account — a landscaper closing out a
 * job, an HOA board checking its own property. The URL IS the
 * credential, so it is held to the standard of one.
 */

describe("generation", () => {
  it("is long enough not to be guessed", () => {
    // 32 bytes base64url -> 43 characters.
    expect(generateLinkToken()).toHaveLength(43);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 500 }, generateLinkToken));
    expect(seen.size).toBe(500);
  });

  it("is URL-safe", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateLinkToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("hashing", () => {
  it("is stable for the same token", () => {
    const token = generateLinkToken();
    expect(hashLinkToken(token)).toBe(hashLinkToken(token));
  });

  it("differs for different tokens", () => {
    expect(hashLinkToken(generateLinkToken())).not.toBe(hashLinkToken(generateLinkToken()));
  });

  it("does not contain the token", () => {
    const token = generateLinkToken();
    expect(hashLinkToken(token)).not.toContain(token);
  });

  it("is a hex sha256", () => {
    expect(hashLinkToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("comparison", () => {
  it("matches identical hashes", () => {
    const hash = hashLinkToken(generateLinkToken());
    expect(tokenHashesMatch(hash, hash)).toBe(true);
  });

  it("rejects different hashes", () => {
    expect(
      tokenHashesMatch(hashLinkToken("a"), hashLinkToken("b"))
    ).toBe(false);
  });

  it("rejects mismatched lengths without throwing", () => {
    expect(tokenHashesMatch(hashLinkToken("a"), "abcd")).toBe(false);
  });
});

describe("the work-order helpers still resolve to the same crypto", () => {
  it("hashes identically through either name", async () => {
    const { hashWorkOrderToken } = await import("@/lib/vendors/tokens");
    const token = generateLinkToken();
    expect(hashWorkOrderToken(token)).toBe(hashLinkToken(token));
  });
});
