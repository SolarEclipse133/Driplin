import { describe, expect, it } from "vitest";
import { parseEnteredProgram, scheduleChanged } from "./entered-schedule";
import type { ScheduleProgram } from "./types";

/**
 * A schedule somebody typed in, for a controller Driplin cannot read.
 *
 * There is no hardware to read back from, so a typo here is not caught
 * later by anything. Driplin would judge the wrong schedule, send a
 * landscaper after a problem that does not exist, and file the result as
 * evidence for a board.
 */

const valid = {
  name: "Front turf",
  days: ["TUE"],
  startTime: "05:30",
  durationMinutes: 20,
};

describe("a well-formed entry", () => {
  it("is accepted", () => {
    const r = parseEnteredProgram(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.program.days).toEqual(["TUE"]);
      expect(r.program.startTime).toBe("05:30");
      expect(r.program.durationMinutes).toBe(20);
      expect(r.program.enabled).toBe(true);
    }
  });

  it("falls back to a usable program name", () => {
    const r = parseEnteredProgram({ ...valid, name: "   " });
    if (!r.ok) throw new Error(r.error);
    expect(r.program.name).toBe("Irrigation");
  });

  it("puts the days in week order, whatever order they arrive in", () => {
    const r = parseEnteredProgram({ ...valid, days: ["SAT", "MON", "WED"] });
    if (!r.ok) throw new Error(r.error);
    expect(r.program.days).toEqual(["MON", "WED", "SAT"]);
  });

  it("counts a day ticked twice only once", () => {
    const r = parseEnteredProgram({ ...valid, days: ["TUE", "TUE"] });
    if (!r.ok) throw new Error(r.error);
    expect(r.program.days).toEqual(["TUE"]);
  });

  it("accepts a lowercase day", () => {
    const r = parseEnteredProgram({ ...valid, days: ["tue"] });
    if (!r.ok) throw new Error(r.error);
    expect(r.program.days).toEqual(["TUE"]);
  });
});

describe("rejecting what cannot be judged", () => {
  it.each(["5:30", "0530", "25:00", "05:60", "", "morning", "5:30am"])(
    "refuses the start time %o",
    (startTime) => {
      expect(parseEnteredProgram({ ...valid, startTime }).ok).toBe(false);
    }
  );

  it.each([0, -5, 1.5, NaN, "abc", null, undefined])(
    "refuses the duration %o",
    (durationMinutes) => {
      expect(parseEnteredProgram({ ...valid, durationMinutes }).ok).toBe(false);
    }
  );

  it("refuses an implausible duration rather than reasoning about it", () => {
    // 1440 entered instead of 14 would have Driplin judging a controller
    // that waters around the clock.
    const r = parseEnteredProgram({ ...valid, durationMinutes: 1440 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("12 hours");
  });

  it("refuses no days at all", () => {
    const r = parseEnteredProgram({ ...valid, days: [] });
    expect(r.ok).toBe(false);
  });

  it("refuses a day it does not recognise", () => {
    expect(parseEnteredProgram({ ...valid, days: ["TUES"] }).ok).toBe(false);
  });

  it("refuses a run that crosses midnight", () => {
    // Cities set their windows by clock time, so a program spanning two
    // days cannot be judged against one.
    const r = parseEnteredProgram({
      ...valid,
      startTime: "23:30",
      durationMinutes: 45,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("past midnight");
  });

  it("allows a run ending exactly at midnight", () => {
    expect(
      parseEnteredProgram({ ...valid, startTime: "23:30", durationMinutes: 30 }).ok
    ).toBe(true);
  });
});

describe("noticing that somebody's word changed", () => {
  const program = (over: Partial<ScheduleProgram> = {}): ScheduleProgram[] => [
    {
      vendorProgramId: "p1",
      name: "Front turf",
      enabled: true,
      days: ["TUE"],
      startTime: "05:30",
      durationMinutes: 20,
      ...over,
    },
  ];

  it("sees no change when nothing changed", () => {
    expect(scheduleChanged(program(), program())).toBe(false);
  });

  it("ignores the order the days are listed in", () => {
    expect(
      scheduleChanged(program({ days: ["TUE", "FRI"] }), program({ days: ["FRI", "TUE"] }))
    ).toBe(false);
  });

  it("ignores a vendor id that was regenerated", () => {
    // The id is Driplin's bookkeeping, not part of what was claimed.
    expect(scheduleChanged(program(), program({ vendorProgramId: "other" }))).toBe(false);
  });

  it.each([
    ["days", { days: ["WED"] as ScheduleProgram["days"] }],
    ["start time", { startTime: "06:00" }],
    ["duration", { durationMinutes: 25 }],
    ["name", { name: "Back turf" }],
    ["enabled", { enabled: false }],
  ])("sees a changed %s", (_label, over) => {
    expect(scheduleChanged(program(), program(over))).toBe(true);
  });

  it("sees a program added or removed", () => {
    expect(scheduleChanged(program(), [])).toBe(true);
    expect(scheduleChanged([], program())).toBe(true);
  });
});
