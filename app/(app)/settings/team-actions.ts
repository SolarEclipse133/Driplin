"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { generateLinkToken, hashLinkToken } from "@/lib/security/tokens";
import { sendEmail } from "@/lib/notifications/senders";

export type InviteState = {
  error: string | null;
  success: string | null;
  /** Shown once, so the inviter can pass it on if email is unreliable. */
  link: string | null;
};

const INVITE_TTL_DAYS = 14;

/**
 * Invite a colleague into this company.
 *
 * The link is the credential, so only its hash is stored — and it is
 * bound to the address it was sent to, which means a forwarded link
 * cannot be redeemed by someone else. The organization a new account
 * joins is decided inside the database trigger from that hash, never
 * by anything the browser sends.
 */
export async function inviteTeammate(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fail = (error: string): InviteState => ({ error, success: null, link: null });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail("Enter a valid email address.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You are no longer signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, full_name, organizations(name)")
    .eq("id", user.id)
    .single();
  if (!profile?.org_id) return fail("Your account has no organization.");

  const org = Array.isArray(profile.organizations)
    ? profile.organizations[0]
    : profile.organizations;
  const orgName = (org?.name as string) ?? "your team";

  // Already on the team? Saying so is more useful than a second invite
  // that will silently do nothing.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("email", email)
    .maybeSingle();
  if (existing) return fail(`${email} is already on this account.`);

  // Supersede any outstanding invitation to the same address, so there
  // is only ever one live link per person.
  await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", profile.org_id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = generateLinkToken();
  const { error } = await supabase.from("invitations").insert({
    org_id: profile.org_id,
    email,
    token_hash: hashLinkToken(token),
    invited_by: profile.id,
    expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (error) return fail("Could not create that invitation.");

  const host = (await headers()).get("host") ?? "driplin.vercel.app";
  const origin = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;
  const link = `${origin}/join/${token}`;

  const inviter = profile.full_name?.trim() || "A colleague";
  const result = await sendEmail(
    email,
    `${inviter} added you to ${orgName} on Driplin`,
    [
      `${inviter} has invited you to join ${orgName} on Driplin, which keeps irrigation schedules inside each city's drought rules.`,
      "",
      "Set up your account here:",
      link,
      "",
      `The link works for ${INVITE_TTL_DAYS} days and only for this email address.`,
      "",
      "— Driplin",
    ].join("\n")
  );

  revalidatePath("/settings");
  return {
    error: null,
    success:
      result.status === "sent"
        ? `Invitation emailed to ${email}.`
        : `Invitation created for ${email}, but email is not configured — send them the link below yourself.`,
    link: result.status === "sent" ? null : link,
  };
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const id = String(formData.get("invitation_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/settings");
}
