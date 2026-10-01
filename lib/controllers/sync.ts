/**
 * Schedule sync: pull a controller's current schedule through the
 * abstraction layer and store it in cached_schedules, so the rest of
 * the app (dashboard, compliance checks) reads our own database and
 * keeps working when a vendor API is unreachable.
 */

import { getVendorApiKey } from "./credentials";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getController } from "./factory";
import { ControllerError, ControllerVendor } from "./types";
import { reportServerError } from "@/lib/observability/report";

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
  //
  // Inside its own guard, because this can throw: decryptSecret raises
  // SecretKeyError when CREDENTIALS_ENCRYPTION_KEY is missing or wrong. It
  // used to be called before the try below, so that one error escaped
  // syncControllerById and the whole nightly run with it -- every property
  // in every organization left unchecked because of one unreadable
  // credential. A credential Driplin cannot read makes THAT controller
  // unreadable and nothing more.
  let apiKey: string | undefined;
  if (controller.vendor !== "demo") {
    try {
      apiKey =
        (await getVendorApiKey(
          supabase,
          controller.org_id,
          controller.vendor
        )) ?? undefined;
    } catch (err) {
      reportServerError("controller.credential_unreadable", err, {
        controllerId: controller.id,
        vendor: controller.vendor,
      });
      await supabase
        .from("controllers")
        .update({ status: "error" })
        .eq("id", controller.id);
      return {
        ok: false,
        error:
          "Driplin could not read this controller's stored credential. Re-enter the vendor API key in Settings.",
      };
    }
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
    // A rotated key or a revoked authorisation shows up here first, and
    // used to leave nothing behind but a status column.
    reportServerError("controller.sync_failed", err, {
      controllerId: controller.id,
      vendor: controller.vendor,
      hadApiKey: apiKey !== undefined,
    });
    return { ok: false, error: message };
  }
}
