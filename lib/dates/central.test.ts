import { describe, expect, it } from "vitest";
import {
  centralCalendarDate,
  daysFromTodayCentral,
  endOfCentralDay,
  isCalendarDate,
  startOfCentralDay,
} from "./central";

/**
 * Central dates, including the two days a year that break naive code.
 *
 * The bug being fixed: the report endpoint resolved a customer's date with
 * a hardcoded -06:00. Central is -05:00 from mid-March to early November,
 * so for most of the year the reporting window sat an hour late --
 * dropping compliance events from the start of the period and pulling in
 * events from the day after it. A board report that quietly omits an event
 * is a defective audit record.
 *
 * US DST in 2026: forward on 8 March, back on 1 November.
 */

const iso = (d: Date | null) => d!.toISOString();

describe("standard time (CST, UTC-6)", () => {
  it("starts a January day at 06:00 UTC", () => {
    expect(iso(startOfCentralDay("2026-01-15"))).toBe("2026-01-15T06:00:00.000Z");
  });

  it("ends it the moment before the next day", () => {
    expect(iso(endOfCentralDay("2026-01-15"))).toBe("2026-01-16T05:59:59.999Z");
  });
});

describe("daylight time (CDT, UTC-5)", () => {
  it("starts a July day at 05:00 UTC, not 06:00", () => {
    // The old hardcoded offset produced 06:00 here, an hour late, and
    // silently excluded anything recorded in that hour.
    expect(iso(startOfCentralDay("2026-07-15"))).toBe("2026-07-15T05:00:00.000Z");
  });

  it("ends it at 04:59:59.999 UTC the next day", () => {
    // The old code ran to 05:59:59 — an hour into the following Central
    // day, pulling that hour's events into the wrong period.
    expect(iso(endOfCentralDay("2026-07-15"))).toBe("2026-07-16T04:59:59.999Z");
  });
});

describe("the day the clocks go forward", () => {
  // 8 March 2026: 02:00 CST becomes 03:00 CDT. The day is 23 hours long.
  it("starts the day in standard time", () => {
    expect(iso(startOfCentralDay("2026-03-08"))).toBe("2026-03-08T06:00:00.000Z");
  });

  it("ends the day in daylight time", () => {
    expect(iso(endOfCentralDay("2026-03-08"))).toBe("2026-03-09T04:59:59.999Z");
  });

  it("makes that day 23 hours long, not 24", () => {
    const span =
      endOfCentralDay("2026-03-08")!.getTime() -
      startOfCentralDay("2026-03-08")!.getTime();
    expect(Math.round(span / 3_600_000)).toBe(23);
  });
});

describe("the day the clocks go back", () => {
  // 1 November 2026: 02:00 CDT becomes 01:00 CST. The day is 25 hours long.
  it("starts the day in daylight time", () => {
    expect(iso(startOfCentralDay("2026-11-01"))).toBe("2026-11-01T05:00:00.000Z");
  });

  it("ends the day in standard time", () => {
    // 2 November begins at 00:00 CST = 06:00 UTC, so the last instant of
    // 1 November is one millisecond before that.
    expect(iso(endOfCentralDay("2026-11-01"))).toBe("2026-11-02T05:59:59.999Z");
  });

  it("makes that day 25 hours long, not 24", () => {
    const span =
      endOfCentralDay("2026-11-01")!.getTime() -
      startOfCentralDay("2026-11-01")!.getTime();
    expect(Math.round(span / 3_600_000)).toBe(25);
  });
});

describe("a period never loses or doubles a moment", () => {
  it("hands the next day's first instant straight on from the last", () => {
    // Any gap here is a window in which a compliance event belongs to no
    // reporting period at all.
    for (const [a, b] of [
      ["2026-01-15", "2026-01-16"],
      ["2026-03-07", "2026-03-08"],
      ["2026-03-08", "2026-03-09"],
      ["2026-07-15", "2026-07-16"],
      ["2026-10-31", "2026-11-01"],
      ["2026-11-01", "2026-11-02"],
    ]) {
      expect(
        startOfCentralDay(b)!.getTime() - endOfCentralDay(a)!.getTime(),
        `${a} -> ${b}`
      ).toBe(1);
    }
  });
});

describe("rejecting what a customer could not have meant", () => {
  it.each(["2026-01-15"])("accepts %s", (d) => {
    expect(isCalendarDate(d)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "15/01/2026",
    "2026-1-5",
    "",
    "yesterday",
    "2026-01-15T00:00",
  ])("refuses %o", (d) => {
    expect(isCalendarDate(d)).toBe(false);
    expect(startOfCentralDay(d)).toBeNull();
    expect(endOfCentralDay(d)).toBeNull();
  });

  it("refuses 29 February in a non-leap year", () => {
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });
});

describe("what day is it, for an expiry check", () => {
  it("is still today at 8pm Central, when UTC has moved on", () => {
    // 2026-07-15 20:00 CDT is 2026-07-16 01:00 UTC. Reading the date off
    // the UTC clock here made anything expiring on the 15th look expired
    // from early evening -- putting a property with a perfectly valid
    // variance back on the city's standard schedule, and flagging it.
    const evening = Date.parse("2026-07-16T01:00:00Z");
    expect(centralCalendarDate(evening)).toBe("2026-07-15");
    expect(daysFromTodayCentral("2026-07-15", evening)).toBe(0);
  });

  it("is still today at 11:30pm Central in winter", () => {
    const lateWinter = Date.parse("2026-01-16T05:30:00Z");
    expect(centralCalendarDate(lateWinter)).toBe("2026-01-15");
    expect(daysFromTodayCentral("2026-01-15", lateWinter)).toBe(0);
  });

  it("rolls over at Central midnight, not UTC midnight", () => {
    const justBefore = Date.parse("2026-07-16T04:59:00Z");
    const justAfter = Date.parse("2026-07-16T05:01:00Z");
    expect(centralCalendarDate(justBefore)).toBe("2026-07-15");
    expect(centralCalendarDate(justAfter)).toBe("2026-07-16");
  });

  it("counts forwards and backwards", () => {
    const noon = Date.parse("2026-07-15T17:00:00Z");
    expect(daysFromTodayCentral("2026-07-20", noon)).toBe(5);
    expect(daysFromTodayCentral("2026-07-14", noon)).toBe(-1);
  });
});
