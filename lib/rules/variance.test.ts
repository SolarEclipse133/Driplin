import { describe, expect, it } from "vitest";
import {
  EXPIRY_WARNING_DAYS,
  describeVariance,
  varianceStatus,
  type Variance,
} from "./variance";
import type { DroughtStage } from "@/lib/jurisdictions";

/**
 * Variances, as utilities actually grant them.
 *
 * Austin Water offers a New Xeriscape Landscape variance, a Large
 * Property variance for "residential or commercial property that cannot
 * be fully watered under the current schedule", and an Environmental
 * one — case by case, through the Austin Water Conservation Hub.
 *   https://www.austintexas.gov/water/find-your-watering-day
 *
 * Because they are case by case, the schedule comes from the approval
 * letter, not from Driplin. What Driplin owes the customer is the two
 * things people forget: variances expire, and Austin narrows which ones
 * remain valid as the drought stage tightens (a variance for any new
 * landscape in Conservation Stage and Stage 1, but only for
 * drought-tolerant landscapes in Stages 2 and 3).
 */

const TODAY = Date.parse("2026-09-30T15:00:00Z");
const day = (offset: number) =>
  new Date(Date.parse("2026-09-30T00:00:00Z") + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

function variance(over: Partial<Variance> = {}): Variance {
  return {
    id: "v1",
    kind: "large_property",
    reference: "AW-2026-4417",
    approvedOn: day(-30),
    expiresOn: day(60),
    allowedDays: ["TUE", "FRI"],
    allowedWindows: [{ start: "00:00", end: "10:00" }],
    approvedAtStage: 2 as DroughtStage,
    notes: null,
    ...over,
  };
}

describe("which variance is in force", () => {
  it("finds an approved, unexpired one", () => {
    const s = varianceStatus([variance()], 2 as DroughtStage, TODAY);
    expect(s.active?.reference).toBe("AW-2026-4417");
    expect(s.daysUntilExpiry).toBe(60);
    expect(s.expiringSoon).toBe(false);
  });

  it("ignores one that has not taken effect yet", () => {
    const s = varianceStatus(
      [variance({ approvedOn: day(3), expiresOn: day(90) })],
      2,
      TODAY
    );
    expect(s.active).toBeNull();
  });

  it("covers the final day, because that is how an approval reads", () => {
    const s = varianceStatus([variance({ expiresOn: day(0) })], 2 as DroughtStage, TODAY);
    expect(s.active).not.toBeNull();
    expect(s.daysUntilExpiry).toBe(0);
  });

  it("drops it the day after it expires", () => {
    const s = varianceStatus([variance({ expiresOn: day(-1) })], 2 as DroughtStage, TODAY);
    expect(s.active).toBeNull();
    expect(s.expired).toHaveLength(1);
  });

  it("refuses one with no reference number", () => {
    // A variance nobody at the utility can look up is not evidence.
    const s = varianceStatus([variance({ reference: "  " })], 2 as DroughtStage, TODAY);
    expect(s.active).toBeNull();
  });

  it("takes the most recently approved when two overlap", () => {
    const older = variance({ id: "old", reference: "AW-1", approvedOn: day(-40) });
    const newer = variance({ id: "new", reference: "AW-2", approvedOn: day(-2) });
    const s = varianceStatus([older, newer], 2 as DroughtStage, TODAY);
    expect(s.active?.id).toBe("new");
  });

  it("reports none when the property has never had one", () => {
    const s = varianceStatus([], 2 as DroughtStage, TODAY);
    expect(s.active).toBeNull();
    expect(s.stageAdvanced).toBe(false);
    expect(s.expired).toEqual([]);
  });
});

describe("a variance about to lapse", () => {
  it("warns inside the notice window", () => {
    const s = varianceStatus(
      [variance({ expiresOn: day(EXPIRY_WARNING_DAYS - 1) })],
      2,
      TODAY
    );
    // A lapsed variance puts the property straight back in violation,
    // so the warning has to arrive with time to renew.
    expect(s.expiringSoon).toBe(true);
  });

  it("does not warn well before it matters", () => {
    const s = varianceStatus(
      [variance({ expiresOn: day(EXPIRY_WARNING_DAYS + 1) })],
      2,
      TODAY
    );
    expect(s.expiringSoon).toBe(false);
  });
});

describe("the stage moving past the one it was granted under", () => {
  it("flags a variance approved at a looser stage", () => {
    // Austin allowed a variance for any new landscape in Conservation
    // Stage and Stage 1, but only for drought-tolerant landscapes in
    // Stages 2 and 3. Driplin cannot adjudicate that -- it can refuse
    // to let it pass unnoticed.
    const s = varianceStatus(
      [variance({ approvedAtStage: 1 as DroughtStage })],
      3,
      TODAY
    );
    expect(s.stageAdvanced).toBe(true);
  });

  it("stays quiet at the stage it was approved under", () => {
    const s = varianceStatus(
      [variance({ approvedAtStage: 2 as DroughtStage })],
      2,
      TODAY
    );
    expect(s.stageAdvanced).toBe(false);
  });

  it("stays quiet when the city has eased off", () => {
    const s = varianceStatus(
      [variance({ approvedAtStage: 3 as DroughtStage })],
      1,
      TODAY
    );
    expect(s.stageAdvanced).toBe(false);
  });
});

describe("describing one for a board or an auditor", () => {
  it("names the reference, the permission and the expiry", () => {
    const text = describeVariance(variance());
    expect(text).toContain("AW-2026-4417");
    expect(text).toContain("Tue, Fri");
    expect(text).toContain("00:00–10:00");
    expect(text).toContain(day(60));
  });

  it("says plainly when any day is permitted", () => {
    expect(describeVariance(variance({ allowedDays: "ALL" }))).toContain("any day");
  });

  it("does not invent a time limit the approval never set", () => {
    expect(describeVariance(variance({ allowedWindows: [] }))).toContain(
      "no stated time limit"
    );
  });
});
