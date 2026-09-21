import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptSecret,
  encryptSecret,
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
