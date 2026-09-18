/**
 * Demo implementation of the IrrigationController abstraction.
 *
 * Simulates a controller whose "device state" lives in the
 * controllers.demo_state column instead of a vendor cloud. It exists so
 * the whole pipeline — schedule sync, compliance checks, corrections —
 * can be exercised end to end without physical hardware, and it doubles
 * as the template for stubbing vendors we can't reach yet (Hydrawise).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ControllerError,
  ControllerInfo,
  ControllerSchedule,
  IrrigationController,
  ScheduleProgram,
} from "./types";

/** The schedule a freshly connected demo controller starts with.
 * Deliberately messy so compliance checks have something to flag. */
export const DEMO_INITIAL_PROGRAMS: ScheduleProgram[] = [
  {
    vendorProgramId: "demo-program-1",
    name: "Front lawn",
    enabled: true,
    days: ["MON", "WED", "FRI"],
    startTime: "10:00",
    durationMinutes: 45,
  },
  {
    vendorProgramId: "demo-program-2",
    name: "Back beds",
    enabled: true,
    days: ["SAT"],
    startTime: "05:30",
    durationMinutes: 30,
  },
];

export class DemoController implements IrrigationController {
  readonly vendor = "demo" as const;

  constructor(
    private supabase: SupabaseClient,
    private controllerId: string,
    private controllerName: string
  ) {}

  private async readState(): Promise<{ programs: ScheduleProgram[] }> {
    const { data, error } = await this.supabase
      .from("controllers")
      .select("demo_state")
      .eq("id", this.controllerId)
      .single();
    if (error) throw new ControllerError("Demo controller state unavailable.");
    const state = data?.demo_state as { programs?: ScheduleProgram[] } | null;
    return { programs: state?.programs ?? DEMO_INITIAL_PROGRAMS };
  }

  async getStatus(): Promise<ControllerInfo> {
    return {
      vendorDeviceId: this.controllerId,
      name: this.controllerName,
      online: true,
    };
  }

  async getSchedule(): Promise<ControllerSchedule> {
    const state = await this.readState();
    return { programs: state.programs };
  }

  async setSchedule(programs: ScheduleProgram[]): Promise<void> {
    const { error } = await this.supabase
      .from("controllers")
      .update({ demo_state: { programs } })
      .eq("id", this.controllerId);
    if (error)
      throw new ControllerError("Could not write demo controller state.");
  }
}
