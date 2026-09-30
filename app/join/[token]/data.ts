import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLinkToken } from "@/lib/security/tokens";

/**
 * What an invitation link points at.
 *
 * Anonymous traffic, so the same discipline as the vendor and board
 * pages: keyed solely by the hash of the token, returning only what
 * the invited person needs to see — which company, and which address
 * the invitation is bound to.
 *
 * It deliberately does NOT hand back the org id. Joining is decided by
 * the database trigger from the token itself; if this page could
 * nominate an organization, anyone could join any company.
 */

export interface PendingInvitation {
  orgName: string;
  email: string;
  invitedBy: string | null;
}

export async function findInvitation(
  token: string
): Promise<PendingInvitation | null> {
  if (!token || token.length < 20) return null;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return null;
  }

  const { data } = await supabase
    .from("invitations")
    .select(
      "email, expires_at, accepted_at, revoked_at, organizations(name), profiles(full_name)"
    )
    .eq("token_hash", hashLinkToken(token))
    .maybeSingle();

  if (!data) return null;
  if (data.accepted_at || data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;

  const org = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
  const inviter = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

  return {
    orgName: (org?.name as string) ?? "your team",
    email: data.email as string,
    invitedBy: (inviter?.full_name as string)?.trim() || null,
  };
}
