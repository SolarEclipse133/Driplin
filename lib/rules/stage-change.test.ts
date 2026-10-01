import { describe, expect, it } from "vitest";
import { buildStageChangeDigest, type StageChangeOutcome } from "./stage-change";

/**
 * The message a customer gets when their city changes the rules.
 *
 * It replaces a scatter of per-controller alerts that said nothing about
 * why they all arrived at once. What it must get right: the properties
 * watering illegally RIGHT NOW have to be impossible to miss, and the
 * message must not dress good news as an emergency.
 */

const base = {
  utility: "Austin Water",
  cityName: "Austin",
  stageName: "Stage 2",
  previousStageName: "Stage 1",
  sourceLink: "https://austintexas.gov/notice",
  propertyCount: 3,
};

const outcome = (over: Partial<StageChangeOutcome> = {}): StageChangeOutcome => ({
  propertyName: "Zilker Terrace",
  controllerName: "Front turf",
  outcome: "corrected",
  instructions: [],
  ...over,
});

describe("naming the cause", () => {
  it("leads with the move, not with the consequences", () => {
    const d = buildStageChangeDigest({ ...base, affected: [] });
    expect(d.body.split("\n")[0]).toContain("moved Austin from Stage 1 to Stage 2");
  });

  it("copes with no known previous stage", () => {
    const d = buildStageChangeDigest({
      ...base,
      previousStageName: null,
      affected: [],
    });
    expect(d.body).toContain("confirmed Stage 2 for Austin");
  });

  it("always cites the utility's own notice", () => {
    // The audit trail is the product; a claim about the rules carries its
    // source.
    const d = buildStageChangeDigest({ ...base, affected: [] });
    expect(d.body).toContain("https://austintexas.gov/notice");
  });

  it("says the re-check already happened", () => {
    const d = buildStageChangeDigest({ ...base, affected: [] });
    expect(d.body).toContain("rather than waiting for tonight");
  });
});

describe("properties watering illegally right now", () => {
  const needsPerson = [
    outcome({
      outcome: "needs_manual_fix",
      propertyName: "Oak Grove",
      instructions: ['Change the program "Turf" to water only Tue.'],
    }),
  ];

  it("puts them in the subject line", () => {
    const d = buildStageChangeDigest({ ...base, affected: needsPerson });
    expect(d.subject).toContain("Action needed");
    expect(d.subject).toContain("1 property");
  });

  it("includes the actual instructions, not just a count", () => {
    const d = buildStageChangeDigest({ ...base, affected: needsPerson });
    expect(d.body).toContain('Change the program "Turf" to water only Tue.');
  });

  it("is critical", () => {
    expect(buildStageChangeDigest({ ...base, affected: needsPerson }).severity).toBe(
      "critical"
    );
  });

  it("lists them before the ones already handled", () => {
    const d = buildStageChangeDigest({
      ...base,
      affected: [outcome({ propertyName: "Fixed Already" }), ...needsPerson],
    });
    expect(d.body.indexOf("NEEDS SOMEONE")).toBeLessThan(
      d.body.indexOf("Fixed Already")
    );
  });

  it("counts plurals properly", () => {
    const d = buildStageChangeDigest({
      ...base,
      affected: [
        outcome({ outcome: "needs_manual_fix", propertyName: "A" }),
        outcome({ outcome: "needs_manual_fix", propertyName: "B" }),
      ],
    });
    expect(d.subject).toContain("2 properties");
    expect(d.needsPersonCount).toBe(2);
  });
});

describe("not dressing good news as an emergency", () => {
  it("is info when everything was corrected automatically", () => {
    const d = buildStageChangeDigest({ ...base, affected: [outcome()] });
    expect(d.severity).toBe("info");
    expect(d.subject).toContain("your properties are covered");
  });

  it("says plainly when nothing needed changing", () => {
    const d = buildStageChangeDigest({ ...base, affected: [] });
    expect(d.body).toContain("already complies");
    expect(d.severity).toBe("info");
  });

  it("still goes out when nothing needs attention", () => {
    // A few times a year, not nightly. "The city moved and you are fine"
    // is worth saying out loud.
    const d = buildStageChangeDigest({ ...base, affected: [] });
    expect(d.body.length).toBeGreaterThan(0);
    expect(d.subject).not.toContain("Action needed");
  });

  it("tells an organization with nothing in that city that nothing changes", () => {
    const d = buildStageChangeDigest({ ...base, propertyCount: 0, affected: [] });
    expect(d.body).toContain("no properties in this city");
  });

  it("names what it corrected, so the work is visible", () => {
    const d = buildStageChangeDigest({
      ...base,
      affected: [outcome({ propertyName: "Zilker Terrace" })],
    });
    expect(d.body).toContain("Already corrected automatically (1)");
    expect(d.body).toContain("Zilker Terrace");
  });
});

describe("properties Driplin cannot judge", () => {
  it("is a warning, not a clean bill of health", () => {
    const d = buildStageChangeDigest({
      ...base,
      affected: [outcome({ outcome: "unreadable" })],
    });
    expect(d.severity).toBe("warning");
    expect(d.body).toContain("making no claim");
  });

  it("groups unreadable and unverifiable rules together", () => {
    const d = buildStageChangeDigest({
      ...base,
      affected: [
        outcome({ outcome: "unreadable", propertyName: "Lost Contact" }),
        outcome({ outcome: "uncertified", propertyName: "Unknown Table" }),
      ],
    });
    expect(d.body).toContain("could not judge (2)");
    expect(d.body).toContain("Lost Contact");
    expect(d.body).toContain("Unknown Table");
  });

  it("is outranked by a property watering illegally", () => {
    const d = buildStageChangeDigest({
      ...base,
      affected: [
        outcome({ outcome: "unreadable" }),
        outcome({ outcome: "needs_manual_fix" }),
      ],
    });
    expect(d.severity).toBe("critical");
  });
});
