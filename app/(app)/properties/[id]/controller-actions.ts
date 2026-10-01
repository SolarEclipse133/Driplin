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
import {
  parseEnteredProgram,
  scheduleChanged,
} from "@/lib/controllers/entered-schedule";
import type { ScheduleProgram } from "@/lib/controllers/types";
import { saveVendorApiKey } from "@/lib/controllers/credentials";
import { NOT_YOURS, ownsProperty } from "@/lib/security/ownership";
import { redirect } from "next/navigation";

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
  if (!orgId) {
    // The only realistic reason to get here is an expired session. A
    // button that silently does nothing reads as a broken product; send
    // them where they can actually recover.
    redirect("/login");
  }
  // SECURITY: see ownsProperty — RLS checks the new row's own org_id, not
  // the property it points at.
  if (!(await ownsProperty(supabase, propertyId))) return;

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
  if (!orgId) {
    // The only realistic reason to get here is an expired session. A
    // button that silently does nothing reads as a broken product; send
    // them where they can actually recover.
    redirect("/login");
  }
  // SECURITY: see ownsProperty — RLS checks the new row's own org_id, not
  // the property it points at.
  if (!(await ownsProperty(supabase, propertyId))) return;

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
  if (!orgId) {
    // The only realistic reason to get here is an expired session. A
    // button that silently does nothing reads as a broken product; send
    // them where they can actually recover.
    redirect("/login");
  }
  await syncControllerById(supabase, controllerId);
  const propertyId = String(formData.get("property_id") ?? "");
  revalidatePath(`/properties/${propertyId}`);
}

export async function removeController(formData: FormData): Promise<void> {
  const controllerId = String(formData.get("controller_id") ?? "");
  if (!controllerId) return;
  const { supabase, orgId } = await requireOrg();
  if (!orgId) {
    // The only realistic reason to get here is an expired session. A
    // button that silently does nothing reads as a broken product; send
    // them where they can actually recover.
    redirect("/login");
  }
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

  if (!propertyId) return { error: "Missing property.", success: null };
  if (!name) return { error: "Give this controller a name, e.g. \"Front entrance timer\".", success: null };

  // Same validation as correcting one later, so the two cannot drift.
  const parsed = parseEnteredProgram({
    name: String(formData.get("program_name") ?? ""),
    days: WEEKDAYS.filter((d) => formData.get(`day_${d}`) === "on"),
    startTime: String(formData.get("start_time") ?? "").trim(),
    durationMinutes: formData.get("duration_minutes"),
  });
  if (!parsed.ok) return { error: parsed.error, success: null };

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return { error: "You are no longer signed in.", success: null };

  // SECURITY: never attach a controller to a property the caller does not
  // own. RLS checks the new row's own org_id, not the property beside it.
  if (!(await ownsProperty(supabase, propertyId)))
    return { error: NOT_YOURS, success: null };

  const { data: inserted, error } = await supabase
    .from("controllers")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      vendor: "manual",
      vendor_device_id: randomUUID(),
      name,
      entered_schedule: {
        programs: [{ vendorProgramId: randomUUID(), ...parsed.program }],
      },
      entered_schedule_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !inserted)
    return { error: "Could not add that controller.", success: null };

  // What was claimed, and by whom. A manual controller's schedule is
  // somebody's word, so the word itself belongs in the record.
  await logEnteredSchedule(supabase, orgId, propertyId, inserted.id, name, [], [
    { vendorProgramId: "new", ...parsed.program },
  ]);

  // Judge it straight away, so the person sees whether what they just
  // described is actually allowed. Note: NOT appliedByHand -- they have
  // told us what the controller is set to, not that they just changed it.
  await verifyControllerNow(supabase, inserted.id);

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  return {
    error: null,
    success: `Added. Driplin will tell you what to change on ${name} whenever the rules move.`,
  };
}

/**
 * Record what somebody says a controller is set to.
 *
 * Every entry and every correction, with the previous version alongside
 * it. "Prove this property watered legally last August" needs what was
 * claimed in August, not the latest version of the story -- and on
 * hardware Driplin cannot read, the claim is all there is.
 */
async function logEnteredSchedule(
  supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"],
  orgId: string,
  propertyId: string,
  controllerId: string,
  controllerName: string,
  before: ScheduleProgram[],
  after: ScheduleProgram[]
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let who = "A team member";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();
    who = profile?.full_name?.trim() || profile?.email || who;
  }

  const describe = (p: ScheduleProgram[]) =>
    p.length === 0
      ? "nothing recorded"
      : p
          .map(
            (x) =>
              `${x.days.join("/")} at ${x.startTime} for ${x.durationMinutes} min`
          )
          .join("; ");

  await supabase.from("compliance_events").insert({
    org_id: orgId,
    property_id: propertyId,
    controller_id: controllerId,
    type: "schedule_entered",
    summary:
      before.length === 0
        ? `${who} recorded what ${controllerName} is set to: ${describe(after)}. Driplin cannot read this controller, so this is their word rather than a checked fact.`
        : `${who} corrected what ${controllerName} is set to, from ${describe(before)} to ${describe(after)}.`,
    details: { enteredBy: who, before, after },
  });
}

/**
 * Correct what a manual controller is recorded as being set to.
 *
 * Before this, the schedule could only be given once, when the
 * controller was added. A typo was permanent: Driplin judged the wrong
 * schedule forever, sent a landscaper after a problem that did not
 * exist, and filed the result as evidence for a board.
 */
export async function updateEnteredSchedule(
  _prev: ManualControllerState,
  formData: FormData
): Promise<ManualControllerState> {
  const controllerId = String(formData.get("controller_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  if (!controllerId) return { error: "Missing controller.", success: null };

  const parsed = parseEnteredProgram({
    name: String(formData.get("program_name") ?? ""),
    days: WEEKDAYS.filter((d) => formData.get(`day_${d}`) === "on"),
    startTime: String(formData.get("start_time") ?? "").trim(),
    durationMinutes: formData.get("duration_minutes"),
  });
  if (!parsed.ok) return { error: parsed.error, success: null };

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return { error: "You are no longer signed in.", success: null };

  const { data: controller } = await supabase
    .from("controllers")
    .select("id, name, vendor, entered_schedule")
    .eq("id", controllerId)
    .single();
  if (!controller) return { error: "Controller not found.", success: null };
  if (controller.vendor !== "manual") {
    // A connected controller's schedule is read from the vendor, so an
    // entered one would be overwritten on the next sync and mislead
    // everyone in between.
    return {
      error:
        "This controller is connected, so Driplin reads its schedule directly. Change it in the manufacturer's app.",
      success: null,
    };
  }

  const before =
    ((controller.entered_schedule as { programs?: ScheduleProgram[] } | null)
      ?.programs) ?? [];
  // Keep the existing program's id so the history lines up rather than
  // looking like one program was deleted and another created.
  const after: ScheduleProgram[] = [
    { vendorProgramId: before[0]?.vendorProgramId ?? randomUUID(), ...parsed.program },
  ];

  if (!scheduleChanged(before, after)) {
    return { error: null, success: "No change — that is what was already recorded." };
  }

  const { error } = await supabase
    .from("controllers")
    .update({
      entered_schedule: { programs: after },
      entered_schedule_at: new Date().toISOString(),
    })
    .eq("id", controllerId);
  if (error) return { error: "Could not save that schedule.", success: null };

  await logEnteredSchedule(
    supabase,
    orgId,
    propertyId,
    controllerId,
    controller.name as string,
    before,
    after
  );

  // Re-judge against the corrected schedule. Not appliedByHand: this is
  // a correction to what Driplin was told, not a claim that the hardware
  // just changed.
  await verifyControllerNow(supabase, controllerId);

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/dashboard");
  return {
    error: null,
    success: "Updated. Driplin has re-checked it against the current rules.",
  };
}
