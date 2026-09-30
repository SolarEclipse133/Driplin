import { describe, expect, it } from "vitest";
import { evaluateCompliance } from "./compliance";
import type { DroughtStage } from "@/lib/jurisdictions";
import type { ScheduleProgram } from "@/lib/controllers/types";
import type { Variance } from "./variance";

/**
 * The engine, end to end.
 *
 * Its most important behaviour is the refusal: when Driplin does not
 * know a city's rule it must make NO judgement and change NOTHING.
 * Pushing a wrong schedule is worse than pushing none, because the
 * customer then believes they are compliant.
 */

const COMMERCIAL = { propertyClass: "commercial" as const, irrigationType: "automatic" as const };

const program = (days: ScheduleProgram["days"], startTime = "10:00"): ScheduleProgram[] => [
  { vendorProgramId: "p1", name: "Turf", enabled: true, days, startTime, durationMinutes: 30 },
];

describe("a verified rule is acted on", () => {
  it("corrects an Austin commercial even address to Tuesday", () => {
    const result = evaluateCompliance(program(["MON"]), 8, 0, "austin", COMMERCIAL);
    expect(result.certified).toBe(true);
    expect(result.correctedPrograms[0].days).toEqual(["TUE"]);
  });

  it("leaves an already-compliant schedule alone", () => {
    const result = evaluateCompliance(program(["TUE"], "05:00"), 8, 0, "austin", COMMERCIAL);
    expect(result.compliant).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("moves a run outside the allowed hours into them", () => {
    const result = evaluateCompliance(program(["TUE"], "12:00"), 8, 0, "austin", COMMERCIAL);
    expect(result.compliant).toBe(false);
    expect(result.correctedPrograms[0].startTime).not.toBe("12:00");
  });
});

describe("an unverified rule is never acted on", () => {
  it.each([1, 2, 3, 4] as DroughtStage[])(
    "Austin stage %i judges nothing and changes nothing",
    (stage) => {
      const result = evaluateCompliance(program(["MON"]), 8, stage, "austin", COMMERCIAL);
      expect(result.certified).toBe(false);
      expect(result.rulesVerified).toBe(false);
      expect(result.correctedPrograms[0].days).toEqual(["MON"]);
      expect(result.findings).toHaveLength(0);
    }
  );

  it("says what IS known before admitting what is not", () => {
    const result = evaluateCompliance(program(["MON"]), 8, 2, "austin", COMMERCIAL);
    const instruction = result.manualInstructions[0];
    expect(instruction).toMatch(/Drought Contingency Plan allows automatic irrigation once a week/);
    expect(instruction).toMatch(/has not confirmed/);
    expect(instruction).toMatch(/Austin Water/);
  });
});

describe("meters with no street address", () => {
  const NO_ADDRESS = { ...COMMERCIAL, noStreetAddress: true };

  it("San Antonio publishes a rule, so Driplin applies it", () => {
    const result = evaluateCompliance(program(["MON"], "06:00"), 0, 2, "san_antonio", NO_ADDRESS);
    expect(result.certified).toBe(true);
    expect(result.correctedPrograms[0].days).toEqual(["WED"]);
  });

  it.each(["austin", "round_rock", "georgetown", "leander", "cedar_park"])(
    "%s publishes none, so Driplin refuses to guess a day",
    (city) => {
      const result = evaluateCompliance(program(["MON"]), 0, 0, city, NO_ADDRESS);
      expect(result.certified).toBe(false);
      expect(result.correctedPrograms[0].days).toEqual(["MON"]);
      expect(result.manualInstructions[0]).toMatch(/no street address/i);
    }
  );
});

describe("the audit snapshot records the basis of every judgement", () => {
  it("captures the class, irrigation type and address basis used", () => {
    const snapshot = evaluateCompliance(program(["MON"]), 8, 0, "austin", COMMERCIAL).rulesSnapshot;
    expect(snapshot.propertyClass).toBe("commercial");
    expect(snapshot.irrigationType).toBe("automatic");
    expect(snapshot.noStreetAddress).toBe(false);
    expect(snapshot.digit).toBe(8);
    expect(snapshot.verified).toBe(true);
  });
});

describe("an approved variance", () => {
  const varianceFor = (over: Partial<Variance> = {}): Variance => ({
    id: "v1",
    kind: "large_property",
    reference: "AW-2026-4417",
    approvedOn: "2026-08-01",
    expiresOn: "2026-12-31",
    allowedDays: ["MON", "THU"],
    allowedWindows: [{ start: "00:00", end: "10:00" }],
    approvedAtStage: 0,
    notes: null,
    ...over,
  });

  it("permits what the city's own table forbids", () => {
    // Austin gives a commercial even address Tuesday. A Large Property
    // variance exists precisely because such a property "cannot be
    // fully watered under the current schedule", so Monday is legal for
    // this one property and Driplin must not flag it.
    const result = evaluateCompliance(
      program(["MON"], "05:00"), 8, 0, "austin", COMMERCIAL, varianceFor()
    );
    expect(result.compliant).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.underVariance).toBe(true);
  });

  it("still flags a day the variance does not cover either", () => {
    // A variance is not a blanket pass.
    const result = evaluateCompliance(
      program(["SAT"], "05:00"), 8, 0, "austin", COMMERCIAL, varianceFor()
    );
    expect(result.compliant).toBe(false);
  });

  it("never pushes a wider schedule to real hardware", () => {
    // The permission rests on a document the CUSTOMER reported. If it
    // does not say what was entered, a push would make Driplin the
    // cause of the violation.
    const permissive = evaluateCompliance(
      program(["MON"], "05:00"), 8, 0, "austin", COMMERCIAL, varianceFor()
    );
    expect(permissive.safeToPush).toBe(false);
    // Without one, pushing is still fine.
    expect(evaluateCompliance(program(["MON"]), 8, 0, "austin", COMMERCIAL).safeToPush).toBe(true);
  });

  it("records the approval it relied on, for the audit trail", () => {
    const result = evaluateCompliance(
      program(["MON"], "05:00"), 8, 0, "austin", COMMERCIAL, varianceFor()
    );
    expect(result.rulesSnapshot.variance).toContain("AW-2026-4417");
  });

  it("leaves the snapshot clean when there is no variance", () => {
    const result = evaluateCompliance(program(["TUE"], "05:00"), 8, 0, "austin", COMMERCIAL);
    expect(result.rulesSnapshot.variance).toBeNull();
    expect(result.underVariance).toBe(false);
  });

  it("judges a stage whose city table Driplin has NOT confirmed", () => {
    // Austin's Stage 3 day assignment is unconfirmed, so normally
    // Driplin refuses to judge. Under a variance it does not need the
    // city's table: the approval letter states what this property may do.
    const result = evaluateCompliance(
      program(["MON"], "05:00"), 8, 3, "austin", COMMERCIAL, varianceFor({ approvedAtStage: 3 })
    );
    expect(result.certified).toBe(true);
    expect(result.compliant).toBe(true);
    expect(result.safeToPush).toBe(false);
  });

  it("honours an approval that permits any day", () => {
    const result = evaluateCompliance(
      program(["MON", "WED", "SAT"], "05:00"), 8, 0, "austin", COMMERCIAL,
      varianceFor({ allowedDays: "ALL" })
    );
    expect(result.compliant).toBe(true);
  });

  it("does not invent an hour limit the approval never set", () => {
    const result = evaluateCompliance(
      program(["MON"], "13:00"), 8, 0, "austin", COMMERCIAL,
      varianceFor({ allowedWindows: [] })
    );
    expect(result.compliant).toBe(true);
  });
});
