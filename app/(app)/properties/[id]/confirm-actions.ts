"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyControllerNow } from "@/lib/rules/run-compliance";

export type ConfirmFixState = {
  error: string | null;
  success: string | null;
  remainingProblems: string[];
};

/**
 * A person says they have updated a controller by hand.
 *
 * Driplin records who said so and when, then goes and re-reads the
 * controller to see whether it is actually right. The record keeps
 * the answer either way — a confirmation that turned out to be wrong
 * is more useful in an audit than one that was never checked.
 */
export async function confirmManualFix(
  _prev: ConfirmFixState,
  formData: FormData
): Promise<ConfirmFixState> {
  const controllerId = String(formData.get("controller_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const fail = (error: string): ConfirmFixState => ({
    error,
    success: null,
    remainingProblems: [],
  });

  if (!controllerId) return fail("Missing controller.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You are no longer signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, full_name, email")
    .eq("id", user.id)
    .single();
  if (!profile) return fail("Your account has no organization.");

  // When was this flagged? The gap between being asked and being done
  // is what the lateness ranking later measures.
  const { data: flagEvent } = await supabase
    .from("compliance_events")
    .select("created_at")
    .eq("controller_id", controllerId)
    .eq("type", "push_failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const check = await verifyControllerNow(supabase, controllerId);
  if (!check.ok) return fail(check.message);

  const who = profile.full_name?.trim() || profile.email || "A team member";
  const summary = check.compliant
    ? `${who} confirmed a manual fix; Driplin re-checked the controller and it now matches the rules.`
    : check.compliant === false
      ? `${who} confirmed a manual fix, but Driplin re-checked the controller and it still does not match the rules.`
      : `${who} confirmed a manual fix. Driplin could not judge it against this city's rules.`;

  const { data: event } = await supabase
    .from("compliance_events")
    .insert({
      org_id: profile.org_id,
      property_id: check.propertyId,
      controller_id: controllerId,
      type: "manual_fix_confirmed",
      summary,
      details: {
        confirmedBy: who,
        via: "manager",
        note: note || null,
        verified: check.compliant,
        remainingProblems: check.remainingProblems,
      },
    })
    .select("id")
    .single();

  await supabase.from("manual_fix_confirmations").insert({
    org_id: profile.org_id,
    property_id: check.propertyId,
    controller_id: controllerId,
    compliance_event_id: event?.id ?? null,
    confirmed_by: profile.id,
    confirmed_by_name: who,
    confirmed_via: "manager",
    note: note || null,
    flagged_at: flagEvent?.created_at ?? null,
    verified: check.compliant,
  });

  revalidatePath(`/properties/${propertyId || check.propertyId}`);
  revalidatePath("/dashboard");

  return {
    error: null,
    success: check.message,
    remainingProblems: check.remainingProblems,
  };
}
