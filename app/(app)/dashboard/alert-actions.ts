"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * A customer clears an alert they have dealt with.
 *
 * This existed only for Driplin's own admins, so a customer had no way to
 * clear anything at all. The database policy has always allowed it --
 * "Members acknowledge their org's alerts" -- which is to say the feature
 * was designed and then not finished.
 *
 * Row-level security scopes the update, so an id from another
 * organization simply matches nothing.
 */
export async function acknowledgeOwnAlert(formData: FormData): Promise<void> {
  const alertId = String(formData.get("alert_id") ?? "");
  if (!alertId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("alerts")
    .update({ acknowledged: true, acknowledged_by: user.id })
    .eq("id", alertId);

  revalidatePath("/dashboard");
}
