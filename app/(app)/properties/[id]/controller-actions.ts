"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccountClient } from "@/lib/controllers/factory";
import { ControllerError } from "@/lib/controllers/types";
import { DEMO_INITIAL_PROGRAMS } from "@/lib/controllers/demo";
import { syncControllerById } from "@/lib/controllers/sync";
import { randomUUID } from "crypto";
import { isValidStreetNumber } from "@/lib/rules/address";
import { verifyControllerNow } from "@/lib/rules/run-compliance";
import { saveVendorApiKey } from "@/lib/controllers/credentials";

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

type ConnectableVendor = "rachio" | "hydrawise";
const VENDOR_NAMES: Record<ConnectableVendor, string> = {
  rachio: "Rachio",
  hydrawise: "Hydrawise",
};

/** Step 1 of the connect flow: validate and store the org's API key. */
export async function saveVendorKey(
  vendor: ConnectableVendor,
  propertyId: string,
  _prev: ConnectFormState,
  formData: FormData
): Promise<ConnectFormState> {
  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (!apiKey)
    return {
      error: `Please paste your ${VENDOR_NAMES[vendor]} API key.`,
      success: null,
    };

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return { error: "You are no longer signed in.", success: null };

  let accountLabel: string;
  try {
    accountLabel = await getAccountClient(vendor, apiKey).validateKey();
  } catch (err) {
    return {
      error:
        err instanceof ControllerError
          ? err.message
          : `Could not validate the key with ${VENDOR_NAMES[vendor]}.`,
      success: null,
    };
  }

  // Encrypted before it touches the database — see lib/crypto/secrets.
  const saved = await saveVendorApiKey(supabase, orgId, vendor, apiKey);
  if (!saved.ok) return { error: saved.error, success: null };

  revalidatePath(`/properties/${propertyId}`);
  return { error: null, success: `Connected: ${accountLabel}.` };
}

/** Step 2: link one device from the vendor account to this property. */
export async function connectVendorDevice(
  vendor: ConnectableVendor,
  propertyId: string,
  formData: FormData
): Promise<void> {
  const deviceId = String(formData.get("device_id") ?? "");
  const deviceName = String(
    formData.get("device_name") ?? `${VENDOR_NAMES[vendor]} controller`
  );
  if (!deviceId) return;

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return;

  const { data: inserted } = await supabase
    .from("controllers")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      vendor,
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

export type MeterFormState = { error: string | null; success: string | null };

/**
 * Point one controller at its own irrigation meter.
 *
 * An HOA commonly holds several meters — the front entrance, the pool,
 * a median down the street — each on its own service address and
 * therefore its own watering day. Leaving these blank means "use the
 * property's address", which is right for the ordinary one-meter case.
 */
export async function setMeterAddress(
  _prev: MeterFormState,
  formData: FormData
): Promise<MeterFormState> {
  const controllerId = String(formData.get("controller_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const noAddress = formData.get("meter_no_street_address") === "on";
  const number = String(formData.get("meter_street_number") ?? "").trim();
  const label = String(formData.get("meter_label") ?? "").trim();

  const fail = (error: string): MeterFormState => ({ error, success: null });
  if (!controllerId) return fail("Missing controller.");

  if (!noAddress && number && !isValidStreetNumber(number)) {
    return fail(
      "Enter the meter's street number, e.g. 1204 or 1204B — or tick the box if it has no address."
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("controllers")
    .update({
      // Blank both fields = inherit the property again.
      meter_street_number: noAddress || !number ? null : number,
      meter_no_street_address: noAddress ? true : null,
      meter_label: label || null,
    })
    .eq("id", controllerId);

  if (error) return fail("Could not save this meter's address.");

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  return {
    error: null,
    success: noAddress
      ? "Saved — this meter has no street address, so the city's rule for such areas applies."
      : number
        ? `Saved — this controller is judged against ${number}.`
        : "Saved — this controller uses the property's address.",
  };
}

export type ManualControllerState = { error: string | null; success: string | null };

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Add a controller Driplin cannot connect to.
 *
 * The person tells us what it is set to; Driplin judges that against
 * the city's rules and tells them what to change. It can never write
 * to the hardware, and it never claims to have verified it.
 */
export async function addManualController(
  _prev: ManualControllerState,
  formData: FormData
): Promise<ManualControllerState> {
  const propertyId = String(formData.get("property_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const programName = String(formData.get("program_name") ?? "").trim() || "Irrigation";
  const days = WEEKDAYS.filter((d) => formData.get(`day_${d}`) === "on");
  const startTime = String(formData.get("start_time") ?? "").trim();
  const duration = Number(formData.get("duration_minutes"));

  if (!propertyId) return { error: "Missing property.", success: null };
  if (!name) return { error: "Give this controller a name, e.g. \"Front entrance timer\".", success: null };
  if (!/^\d{2}:\d{2}$/.test(startTime))
    return { error: "Enter the start time as HH:MM, e.g. 05:30.", success: null };
  if (!Number.isInteger(duration) || duration < 1)
    return { error: "Enter how many minutes it runs for.", success: null };

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return { error: "You are no longer signed in.", success: null };

  const { data: inserted, error } = await supabase
    .from("controllers")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      vendor: "manual",
      vendor_device_id: randomUUID(),
      name,
      entered_schedule: {
        programs: [
          {
            vendorProgramId: randomUUID(),
            name: programName,
            enabled: true,
            days,
            startTime,
            durationMinutes: duration,
          },
        ],
      },
      entered_schedule_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !inserted)
    return { error: "Could not add that controller.", success: null };

  // Judge it straight away, so the person sees whether what they just
  // described is actually allowed.
  await verifyControllerNow(supabase, inserted.id);

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  return {
    error: null,
    success: `Added. Driplin will tell you what to change on ${name} whenever the rules move.`,
  };
}
