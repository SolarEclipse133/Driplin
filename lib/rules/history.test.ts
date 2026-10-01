import { describe, expect, it } from "vitest";
import {
  MIN_COVERAGE_TO_QUOTE,
  complianceHistory,
  describeHistory,
  type HistoryEvent,
} from "./history";

/**
 * Compliance over time.
 *
 * The trap this guards against is the headline percentage. "94% compliant"
 * sounds like an answer and is a lie whenever Driplin was not looking — a
 * night the job never ran, a controller it could not read, a property
 * added last week. Those are not compliant days. They are days nobody
 * knows about, and counting them either way turns a compliance record into
 * marketing.
 */

// Noon Central, so the day never depends on which side of UTC midnight
// the timestamp falls.
const at = (date: string, type: string): HistoryEvent => ({
  created_at: `${date}T18:00:00Z`,
  type,
});

describe("a day Driplin checked and found fine", () => {
  it("counts as compliant", () => {
    const h = complianceHistory(
      [at("2026-07-01", "check")],
      "2026-07-01",
      "2026-07-01"
    );
    expect(h.days[0].status).toBe("compliant");
    expect(h.compliantDays).toBe(1);
  });

  it("is still compliant when Driplin corrected it that day", () => {
    // An automatic correction is Driplin working, not the property failing.
    const h = complianceHistory(
      [at("2026-07-01", "auto_correction")],
      "2026-07-01",
      "2026-07-01"
    );
    expect(h.days[0].status).toBe("compliant");
  });
});

describe("a day something was wrong", () => {
  it.each(["violation", "push_failed", "work_order_stale", "controller_unreadable"])(
    "counts %s as a violation day",
    (type) => {
      const h = complianceHistory([at("2026-07-01", type)], "2026-07-01", "2026-07-01");
      expect(h.days[0].status).toBe("violation");
    }
  );

  it("beats a clean check on the same day", () => {
    const h = complianceHistory(
      [at("2026-07-01", "check"), at("2026-07-01", "violation")],
      "2026-07-01",
      "2026-07-01"
    );
    expect(h.days[0].status).toBe("violation");
  });
});

describe("a day nobody looked", () => {
  it("is neither compliant nor a violation", () => {
    const h = complianceHistory([], "2026-07-01", "2026-07-03");
    expect(h.uncheckedDays).toBe(3);
    expect(h.compliantDays).toBe(0);
    expect(h.violationDays).toBe(0);
  });

  it("breaks a compliant streak rather than being counted through", () => {
    // Claiming an unbroken run across days nobody looked at is the whole
    // failure this guards against.
    const h = complianceHistory(
      [
        at("2026-07-01", "check"),
        at("2026-07-02", "check"),
        // 3rd: the nightly job did not run.
        at("2026-07-04", "check"),
        at("2026-07-05", "check"),
      ],
      "2026-07-01",
      "2026-07-05"
    );
    expect(h.longestCompliantRun).toBe(2);
    expect(h.currentRun).toBe(2);
  });

  it("is reported as loudly as the rest", () => {
    const h = complianceHistory(
      [at("2026-07-01", "check")],
      "2026-07-01",
      "2026-07-02"
    );
    expect(describeHistory(h)).toContain("1 day went unchecked");
    expect(describeHistory(h)).toContain("counted as neither");
  });
});

describe("refusing to quote a flattering number", () => {
  it("gives no percentage when most of the period was not checked", () => {
    // Two days checked out of ten. A "100% compliant" here would be true
    // of the data and false about the property.
    const h = complianceHistory(
      [at("2026-07-01", "check"), at("2026-07-02", "check")],
      "2026-07-01",
      "2026-07-10"
    );
    expect(h.compliantShare).toBeNull();
    expect(describeHistory(h)).toContain("too few to put a figure on");
  });

  it("quotes one once coverage is good enough", () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      at(`2026-07-0${i + 1}`, i === 0 ? "violation" : "check")
    );
    const h = complianceHistory(events, "2026-07-01", "2026-07-10");
    expect(h.coverage).toBeGreaterThanOrEqual(MIN_COVERAGE_TO_QUOTE);
    expect(h.compliantShare).toBeCloseTo(8 / 9, 5);
    expect(describeHistory(h)).toContain("89%");
  });

  it("measures the share against days CHECKED, not days elapsed", () => {
    // Otherwise a gap in Driplin's own coverage reads as the customer's
    // non-compliance.
    const events = Array.from({ length: 7 }, (_, i) =>
      at(`2026-07-0${i + 1}`, "check")
    );
    const h = complianceHistory(events, "2026-07-01", "2026-07-10");
    expect(h.compliantShare).toBe(1);
    expect(h.uncheckedDays).toBe(3);
  });

  it("says plainly when there is no record at all", () => {
    const h = complianceHistory([], "2026-07-01", "2026-07-30");
    expect(describeHistory(h)).toContain("nothing can be claimed");
  });
});

describe("the shape of the period", () => {
  it("covers every day inclusive of both ends", () => {
    const h = complianceHistory([], "2026-07-01", "2026-07-31");
    expect(h.totalDays).toBe(31);
    expect(h.days[0].date).toBe("2026-07-01");
    expect(h.days[30].date).toBe("2026-07-31");
  });

  it("spans a month boundary", () => {
    const h = complianceHistory([], "2026-07-30", "2026-08-02");
    expect(h.days.map((d) => d.date)).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});
