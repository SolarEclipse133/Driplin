import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { ManualController, saveEnteredSchedule } from "./manual";
import { getController } from "./factory";
import { ScheduleWriteNotSupportedError, type ScheduleProgram } from "./types";
import { evaluateCompliance } from "@/lib/rules/compliance";

/**
 * Controllers Driplin cannot talk to.
 *
 * Much HOA common-area irrigation runs on hardware with no network —
 * a timer on a wall. Driplin still does the part that matters: knows
 * the rules, says what to change, keeps the record.
 *
 * The line it must not cross is claiming to have checked. It cannot
 * read the hardware, so a confirmation is somebody's word. Everything
 * else in Driplin's record is trustworthy precisely because that
 * distinction is kept.
 */

const SCHEDULE: ScheduleProgram[] = [
  {
    vendorProgramId: "p1",
    name: "Front lawn",
    enabled: true,
    days: ["MON", "WED", "FRI"],
    startTime: "10:00",
    durationMinutes: 45,
  },
];

const dbWith = (entered: unknown) =>
  fakeSupabase({
    controllers: [{ id: "c1", name: "Front entrance timer", entered_schedule: entered }],
  });

describe("reading a hand-entered schedule", () => {
  it("returns what the person typed in", async () => {
    const db = dbWith({ programs: SCHEDULE });
    const controller = new ManualController(db, "c1", "Front entrance timer");
    expect((await controller.getSchedule()).programs).toEqual(SCHEDULE);
  });

  it("returns nothing rather than inventing a schedule when none was entered", async () => {
    const db = dbWith(null);
    const controller = new ManualController(db, "c1", "Front entrance timer");
    expect((await controller.getSchedule()).programs).toEqual([]);
  });

  it("reports itself as a real device that is out there watering", async () => {
    const db = dbWith(null);
    const status = await new ManualController(db, "c1", "Front entrance timer").getStatus();
    expect(status.online).toBe(true);
    expect(status.name).toBe("Front entrance timer");
  });
});

describe("writing is refused, which is what routes it to a person", () => {
  it("throws the error that triggers the manual-fix flow", async () => {
    const db = dbWith({ programs: SCHEDULE });
    const controller = new ManualController(db, "c1", "Front entrance timer");
    await expect(controller.setSchedule()).rejects.toBeInstanceOf(ScheduleWriteNotSupportedError);
  });

  it("explains why in terms a manager understands", async () => {
    const db = dbWith({ programs: SCHEDULE });
    await expect(new ManualController(db, "c1", "t").setSchedule()).rejects.toThrow(
      /not connected to the internet/
    );
  });
});

describe("the factory builds one", () => {
  it("returns a ManualController for vendor 'manual'", () => {
    const db = dbWith(null);
    const controller = getController(
      { id: "c1", vendor: "manual", vendor_device_id: "x", name: "Timer" },
      { supabase: db }
    );
    expect(controller.vendor).toBe("manual");
  });
});

describe("saving what someone says it is now set to", () => {
  it("records the schedule and when it was told to us", async () => {
    const db = dbWith(null);
    const before = Date.now();
    expect(await saveEnteredSchedule(db, "c1", SCHEDULE)).toEqual({ ok: true });
    const row = db.tables.controllers[0];
    expect(row.entered_schedule).toEqual({ programs: SCHEDULE });
    expect(Date.parse(row.entered_schedule_at as string)).toBeGreaterThanOrEqual(before);
  });
});

describe("the rules engine treats it like any other controller", () => {
  it("judges a hand-entered schedule against the city's rules", () => {
    // Austin commercial, even address: Tuesday only, and not at 10am.
    const result = evaluateCompliance(SCHEDULE, 8, 0, "austin", {
      propertyClass: "commercial",
      irrigationType: "automatic",
    });
    expect(result.compliant).toBe(false);
    expect(result.correctedPrograms[0].days).toEqual(["TUE"]);
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
