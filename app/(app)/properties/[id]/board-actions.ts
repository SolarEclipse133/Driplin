"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { generateLinkToken, hashLinkToken } from "@/lib/security/tokens";
import { NOT_YOURS, ownsProperty } from "@/lib/security/ownership";

export type BoardLinkState = {
  error: string | null;
  success: string | null;
  /** Shown exactly once, at creation. Driplin stores only the hash. */
  link: string | null;
};

/** A board link lasts a year, then has to be renewed deliberately. */
const TTL_DAYS = 365;

export async function createBoardLink(
  _prev: BoardLinkState,
  formData: FormData
): Promise<BoardLinkState> {
  const propertyId = String(formData.get("property_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const fail = (error: string): BoardLinkState => ({ error, success: null, link: null });

  if (!propertyId) return fail("Missing property.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You are no longer signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("id", user.id)
    .single();
  if (!profile?.org_id) return fail("Your account has no organization.");

  // SECURITY: a board link is a public URL to this property's compliance
  // record. Without this check anyone signed in could mint one for
  // somebody else's property -- /board/[token] resolves it with the
  // service role, so RLS never got a say.
  if (!(await ownsProperty(supabase, propertyId))) return fail(NOT_YOURS);

  // Replacing an existing link revokes it. A board should have one live
  // link, and handing out a second without killing the first means the
  // old one keeps working after somebody leaves the board.
  await supabase
    .from("board_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("property_id", propertyId)
    .is("revoked_at", null);

  const token = generateLinkToken();
  const { error } = await supabase.from("board_links").insert({
    org_id: profile.org_id,
    property_id: propertyId,
    token_hash: hashLinkToken(token),
    label: label || null,
    created_by: profile.id,
    expires_at: new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString(),
  });
  if (error) return fail("Could not create that link.");

  const host = (await headers()).get("host") ?? "driplin.vercel.app";
  const origin = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;

  revalidatePath(`/properties/${propertyId}`);
  return {
    error: null,
    success: "Link created. Driplin stores only a hash of it, so this is the one time it can be shown.",
    link: `${origin}/board/${token}`,
  };
}

export async function revokeBoardLink(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("property_id") ?? "");
  const linkId = String(formData.get("link_id") ?? "");
  if (!linkId) return;

  const supabase = await createClient();
  await supabase
    .from("board_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);

  revalidatePath(`/properties/${propertyId}`);
}
