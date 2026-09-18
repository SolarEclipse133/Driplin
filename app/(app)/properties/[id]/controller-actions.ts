"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccountClient } from "@/lib/controllers/factory";
import { ControllerError } from "@/lib/controllers/types";
import { DEMO_INITIAL_PROGRAMS } from "@/lib/controllers/demo";
import { syncControllerById } from "@/lib/controllers/sync";
import { randomUUID } from "crypto";

export type ConnectFormState = { error: string | null; success: string | null };

async function requireOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, orgId: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  return { supabase, orgId: profile?.org_id ?? null };
}

/** Step 1 of the Rachio flow: validate and store the org's API key. */
export async function saveRachioKey(
  propertyId: string,
  _prev: ConnectFormState,
  formData: FormData
): Promise<ConnectFormState> {
  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (!apiKey) return { error: "Please paste your Rachio API key.", success: null };

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return { error: "You are no longer signed in.", success: null };

  let accountLabel: string;
  try {
    accountLabel = await getAccountClient("rachio", apiKey).validateKey();
  } catch (err) {
    return {
      error:
        err instanceof ControllerError
          ? err.message
          : "Could not validate the key with Rachio.",
      success: null,
    };
  }

  const { error } = await supabase
    .from("vendor_credentials")
    .upsert({ org_id: orgId, vendor: "rachio", api_key: apiKey }, { onConflict: "org_id,vendor" });
  if (error) return { error: "Could not store the key.", success: null };

  revalidatePath(`/properties/${propertyId}`);
  return { error: null, success: `Connected to Rachio account ${accountLabel}.` };
}

/** Step 2: link one device from the Rachio account to this property. */
export async function connectRachioDevice(
  propertyId: string,
  formData: FormData
): Promise<void> {
  const deviceId = String(formData.get("device_id") ?? "");
  const deviceName = String(formData.get("device_name") ?? "Rachio controller");
  if (!deviceId) return;

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return;

  const { data: inserted } = await supabase
    .from("controllers")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      vendor: "rachio",
      vendor_device_id: deviceId,
      name: deviceName,
    })
    .select("id")
    .single();

  if (inserted) await syncControllerById(supabase, inserted.id);
  revalidatePath(`/properties/${propertyId}`);
}

/** Adds a simulated controller (no hardware needed). */
export async function addDemoController(
  propertyId: string,
  _formData: FormData
): Promise<void> {
  const { supabase, orgId } = await requireOrg();
  if (!orgId) return;

  const { data: inserted } = await supabase
    .from("controllers")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      vendor: "demo",
      vendor_device_id: randomUUID(),
      name: "Demo controller",
      demo_state: { programs: DEMO_INITIAL_PROGRAMS },
    })
    .select("id")
    .single();

  if (inserted) await syncControllerById(supabase, inserted.id);
  revalidatePath(`/properties/${propertyId}`);
}

/** Re-pull the controller's schedule into our cache. */
export async function syncController(formData: FormData): Promise<void> {
  const controllerId = String(formData.get("controller_id") ?? "");
  if (!controllerId) return;
  const { supabase, orgId } = await requireOrg();
  if (!orgId) return;
  await syncControllerById(supabase, controllerId);
  const propertyId = String(formData.get("property_id") ?? "");
  revalidatePath(`/properties/${propertyId}`);
}

export async function removeController(formData: FormData): Promise<void> {
  const controllerId = String(formData.get("controller_id") ?? "");
  if (!controllerId) return;
  const { supabase, orgId } = await requireOrg();
  if (!orgId) return;
  await supabase.from("controllers").delete().eq("id", controllerId);
  const propertyId = String(formData.get("property_id") ?? "");
  revalidatePath(`/properties/${propertyId}`);
}
