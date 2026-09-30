import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ControllerError,
  ControllerInfo,
  ControllerSchedule,
  IrrigationController,
  ScheduleProgram,
  ScheduleWriteNotSupportedError,
} from "./types";

/**
 * A controller Driplin cannot talk to.
 *
 * Old commercial timers — Rain Bird ESP, Hunter ICC, Toro — are boxes
 * on a wall with a dial. No network, no API, nothing to connect. A
 * great deal of HOA common-area irrigation runs on exactly these, and
 * before this they were invisible to Driplin.
 *
 * The trick is that almost nothing else needs to change. The schedule
 * is typed in by a person instead of read from a vendor, and writing
 * is refused — which routes straight into the manual-fix flow that
 * already exists for Hydrawise and for failed pushes. Rules, vendor
 * work orders, photo proof, benchmarking and board reports all work
 * unmodified.
 *
 * The one thing it must never do is claim verification. Driplin cannot
 * read this hardware, so it cannot check that a fix was made. A
 * confirmation on a manual controller is somebody's word, recorded as
 * such.
 */
export class ManualController implements IrrigationController {
  readonly vendor = "manual" as const;

  constructor(
    private supabase: SupabaseClient,
    private controllerId: string,
    private controllerName: string
  ) {}

  async getStatus(): Promise<ControllerInfo> {
    return {
      vendorDeviceId: this.controllerId,
      name: this.controllerName,
      // It is a physical timer on a wall. It is "online" in the only
      // sense that matters: it is out there watering.
      online: true,
    };
  }

  async getSchedule(): Promise<ControllerSchedule> {
    const { data, error } = await this.supabase
      .from("controllers")
      .select("entered_schedule")
      .eq("id", this.controllerId)
      .single();
    if (error) throw new ControllerError("Could not read the entered schedule.");

    const entered = data?.entered_schedule as
      | { programs?: ScheduleProgram[] }
      | null;
    // Nobody has typed one in yet. An empty schedule is honest: we
    // genuinely do not know what this controller is doing.
    return { programs: entered?.programs ?? [] };
  }

  async setSchedule(): Promise<void> {
    throw new ScheduleWriteNotSupportedError(
      "manual",
      "this controller is not connected to the internet, so Driplin cannot change it remotely"
    );
  }
}

/** Records what a person says the controller is now set to. */
export async function saveEnteredSchedule(
  supabase: SupabaseClient,
  controllerId: string,
  programs: ScheduleProgram[]
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("controllers")
    .update({
      entered_schedule: { programs },
      entered_schedule_at: new Date().toISOString(),
    })
    .eq("id", controllerId);
  if (error) return { ok: false, error: "Could not save that schedule." };
  return { ok: true };
}
