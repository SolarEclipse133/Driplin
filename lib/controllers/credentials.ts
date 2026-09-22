import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptSecret,
  encryptionAvailable,
  encryptSecret,
  isEncrypted,
  SecretKeyError,
} from "@/lib/crypto/secrets";

/**
 * The ONLY way the application reads or writes a vendor API key.
 *
 * Every call site goes through here so that encryption cannot be
 * forgotten by whoever adds the next one. Nothing outside this file
 * should select or update vendor_credentials.api_key.
 */

/**
 * Binds the ciphertext to the row it belongs to. A credential lifted
 * from another organization's row fails to decrypt rather than
 * quietly working.
 */
function aadFor(orgId: string, vendor: string): string {
  return `vendor_credentials:${orgId}:${vendor}`;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveVendorApiKey(
  supabase: SupabaseClient,
  orgId: string,
  vendor: string,
  apiKey: string
): Promise<SaveResult> {
  let stored: string;
  try {
    stored = encryptSecret(apiKey, aadFor(orgId, vendor));
  } catch (err) {
    // Fail closed. A missing or broken key must never mean "store it
    // in the clear instead" — that is the bug this module exists to
    // remove.
    return {
      ok: false,
      error:
        err instanceof SecretKeyError
          ? `Driplin cannot store credentials securely right now: ${err.message}`
          : "Could not store that key securely.",
    };
  }

  const { error } = await supabase
    .from("vendor_credentials")
    .upsert(
      { org_id: orgId, vendor, api_key: stored },
      { onConflict: "org_id,vendor" }
    );
  if (error) return { ok: false, error: "Could not save that API key." };
  return { ok: true };
}

/**
 * Read a vendor key, decrypting it.
 *
 * `upgrade` re-writes a row that is still plaintext from before
 * encryption existed. It is on by default but turned off in page
 * renders, which should not be writing to the database.
 */
export async function getVendorApiKey(
  supabase: SupabaseClient,
  orgId: string,
  vendor: string,
  { upgrade = true }: { upgrade?: boolean } = {}
): Promise<string | null> {
  const { data } = await supabase
    .from("vendor_credentials")
    .select("api_key")
    .eq("org_id", orgId)
    .eq("vendor", vendor)
    .maybeSingle();

  const stored = data?.api_key as string | undefined;
  if (!stored) return null;

  const { value, legacy } = decryptSecret(stored, aadFor(orgId, vendor));

  if (legacy && upgrade) {
    // Migrate it in place the first time it is used, so there is no
    // flag day and no manual re-entry. Best effort: a failure here
    // must not stop the caller from doing its job.
    try {
      const reEncrypted = encryptSecret(value, aadFor(orgId, vendor));
      await supabase
        .from("vendor_credentials")
        .update({ api_key: reEncrypted })
        .eq("org_id", orgId)
        .eq("vendor", vendor);
    } catch {
      // No key configured yet, or the write was refused. The caller
      // still gets a working credential; the row is upgraded next time.
    }
  }

  return value;
}

/** Which vendors this organization has a key on file for. */
export async function vendorsWithCredentials(
  supabase: SupabaseClient,
  orgId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("vendor_credentials")
    .select("vendor")
    .eq("org_id", orgId);
  return new Set((data ?? []).map((r) => r.vendor as string));
}

/**
 * Re-encrypt any credential still stored as plaintext.
 *
 * The lazy upgrade in getVendorApiKey only fires when a key is
 * actually used, and a key belonging to an account with no connected
 * hardware yet is never used. Without this sweep, "credentials are
 * encrypted" would be true only of the rows that happen to get read —
 * which is not a guarantee worth making.
 *
 * Runs in the nightly job with the service-role client, so it sees
 * every organization. Does nothing when no encryption key is
 * configured, and never throws: a failure here must not take the
 * nightly compliance run down with it.
 */
export async function upgradeLegacyCredentials(
  supabase: SupabaseClient
): Promise<{ upgraded: number; failed: number; skipped: string | null }> {
  if (!encryptionAvailable()) {
    return { upgraded: 0, failed: 0, skipped: "no encryption key configured" };
  }

  const { data, error } = await supabase
    .from("vendor_credentials")
    .select("id, org_id, vendor, api_key");
  if (error || !data) {
    return { upgraded: 0, failed: 0, skipped: "could not read credentials" };
  }

  let upgraded = 0;
  let failed = 0;
  for (const row of data) {
    const stored = row.api_key as string;
    if (isEncrypted(stored)) continue;
    try {
      const reEncrypted = encryptSecret(
        stored,
        aadFor(row.org_id as string, row.vendor as string)
      );
      const { error: writeError } = await supabase
        .from("vendor_credentials")
        .update({ api_key: reEncrypted })
        .eq("id", row.id);
      if (writeError) failed += 1;
      else upgraded += 1;
    } catch {
      failed += 1;
    }
  }
  return { upgraded, failed, skipped: null };
}
