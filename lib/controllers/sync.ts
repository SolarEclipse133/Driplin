/**
 * Schedule sync: pull a controller's current schedule through the
 * abstraction layer and store it in cached_schedules, so the rest of
 * the app (dashboard, compliance checks) reads our own database and
 * keeps working when a vendor API is unreachable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getController } from "./factory";
import { ControllerError, ControllerVendor } from "./types";

export async function syncControllerById(
  supabase: SupabaseClient,
  controllerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: controller, error } = await supabase
    .from("controllers")
    .select("id, org_id, vendor, vendor_device_id, name")
    .eq("id", controllerId)
    .single();
  if (error || !controller) return { ok: false, error: "Controller not found." };

  // Vendor API key (demo controllers don't need one).
  let apiKey: string | undefined;
  if (controller.vendor !== "demo") {
    const { data: cred } = await supabase
      .from("vendor_credentials")
      .select("api_key")
      .eq("org_id", controller.org_id)
      .eq("vendor", controller.vendor)
      .single();
    apiKey = cred?.api_key;
  }

  try {
    const impl = getController(
      {
        id: controller.id,
        vendor: controller.vendor as ControllerVendor,
        vendor_device_id: controller.vendor_device_id,
        name: controller.name,
      },
      { apiKey, supabase }
    );
    const schedule = await impl.getSchedule();

    const { error: upsertError } = await supabase.from("cached_schedules").upsert({
      controller_id: controller.id,
      org_id: controller.org_id,
      schedule,
      fetched_at: new Date().toISOString(),
    });
    if (upsertError)
      return { ok: false, error: "Could not store the fetched schedule." };

    await supabase
      .from("controllers")
      .update({ status: "connected", last_seen_at: new Date().toISOString() })
      .eq("id", controller.id);

    return { ok: true };
  } catch (err) {
    // Keep the cached schedule as-is; just mark the controller errored.
    await supabase
      .from("controllers")
      .update({ status: "error" })
      .eq("id", controller.id);
    const message =
      err instanceof ControllerError
        ? err.message
        : "Unexpected error talking to the controller.";
    return { ok: false, error: message };
  }
}
