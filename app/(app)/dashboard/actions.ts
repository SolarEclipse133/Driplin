"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";

export type CheckState = { error: string | null; success: string | null };

/** Manager-triggered compliance re-check for their own organization. */
export async function recheckCompliance(
  _prev: CheckState,
  _formData: FormData
): Promise<CheckState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are no longer signed in.", success: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Your account has no organization.", success: null };

  const s = await runComplianceForOrg(supabase, profile.org_id);

  revalidatePath("/dashboard");
  revalidatePath("/properties");
  if (s.errors.length > 0)
    return { error: s.errors.join(" "), success: null };
  const uncertifiedNote =
    s.uncertified > 0
      ? `, ${s.uncertified} in a city whose published schedule Driplin hasn't confirmed yet`
      : "";
  return {
    error: null,
    success: `Checked ${s.checked} controller(s): ${s.compliant} compliant, ${s.corrected} auto-corrected, ${s.needsManualFix} need a manual fix${uncertifiedNote}.`,
  };
}
