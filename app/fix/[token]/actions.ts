"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashWorkOrderToken } from "@/lib/vendors/tokens";
import { verifyControllerNow } from "@/lib/rules/run-compliance";
import { storeFixPhoto } from "@/lib/photos/store";
import { findWorkOrderByToken } from "./data";

export type VendorConfirmState = {
  error: string | null;
  success: string | null;
  stillWrong: string[];
};

/**
 * The vendor marks the job done.
 *
 * Same rule as when a manager confirms: Driplin re-reads the controller
 * rather than taking the tap at face value, and records what it found.
 * The work order is only closed if the token is still valid — an
 * expired or already-completed link cannot be replayed.
 */
export async function completeWorkOrder(
  _prev: VendorConfirmState,
  formData: FormData
): Promise<VendorConfirmState> {
  const token = String(formData.get("token") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const fail = (error: string): VendorConfirmState => ({
    error,
    success: null,
    stillWrong: [],
  });

  const order = await findWorkOrderByToken(token);
  if (!order) return fail("This link is not valid.");
  if (order.status !== "open")
    return fail("This job has already been closed out.");
  if (order.expired)
    return fail("This link has expired. Ask your client to send a new one.");
  if (!order.controllerId)
    return fail("This controller is no longer set up in Driplin.");

  const supabase = createAdminClient();

  // The org folder comes from the work order the token resolved to,
  // never from anything the vendor submitted.
  const photoFile = formData.get("photo");
  const photo = await storeFixPhoto(
    supabase,
    order.orgId,
    photoFile instanceof File ? photoFile : null
  );
  if (!photo.ok) return fail(photo.error);

  const check = await verifyControllerNow(supabase, order.controllerId);
  if (!check.ok) return fail(check.message);

  const who = name || order.vendorName || "Vendor";

  const { data: flagEvent } = await supabase
    .from("compliance_events")
    .select("created_at")
    .eq("controller_id", order.controllerId)
    .eq("type", "push_failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const summary = check.compliant
    ? `${who} (vendor) confirmed the controller was updated; Driplin re-checked it and it now matches the rules.`
    : check.compliant === false
      ? `${who} (vendor) confirmed the controller was updated, but Driplin re-checked it and it still does not match the rules.`
      : `${who} (vendor) confirmed the controller was updated. Driplin could not judge it against this city's rules.`;

  const { data: event } = await supabase
    .from("compliance_events")
    .insert({
      org_id: order.orgId,
      property_id: order.propertyId,
      controller_id: order.controllerId,
      type: "manual_fix_confirmed",
      summary,
      details: {
        confirmedBy: who,
        via: "vendor",
        note: note || null,
        verified: check.compliant,
        remainingProblems: check.remainingProblems,
        workOrderId: order.id,
        photoPath: photo.path,
      },
    })
    .select("id")
    .single();

  const { data: confirmation } = await supabase
    .from("manual_fix_confirmations")
    .insert({
      org_id: order.orgId,
      property_id: order.propertyId,
      controller_id: order.controllerId,
      compliance_event_id: event?.id ?? null,
      confirmed_by: null,
      confirmed_by_name: who,
      confirmed_via: "vendor",
      note: note || null,
      photo_path: photo.path,
      photo_mime: photo.mime,
      flagged_at: flagEvent?.created_at ?? null,
      verified: check.compliant,
    })
    .select("id")
    .single();

  // Close the job, and only if it is still open — a replayed submit
  // cannot re-close it.
  await supabase
    .from("work_orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      confirmation_id: confirmation?.id ?? null,
    })
    .eq("token_hash", hashWorkOrderToken(token))
    .eq("status", "open");

  revalidatePath(`/properties/${order.propertyId}`);

  return {
    error: null,
    success: check.compliant
      ? "Thanks — we checked the controller and it now matches the required schedule. Nothing else to do."
      : check.compliant === false
        ? "Thanks. We checked the controller, but it still doesn't match the required schedule — see below."
        : "Thanks, that's been recorded.",
    stillWrong: check.remainingProblems,
  };
}
