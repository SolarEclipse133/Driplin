import { describe, expect, it } from "vitest";
import { explainVerdict, type RulesSnapshot } from "./explain";

/**
 * Showing the working.
 *
 * Both the Austin and Leander tables once shipped WRONG for commercial
 * accounts — plausible, confidently applied, and rewriting controllers
 * onto days those cities prohibit. Nobody using Driplin could have caught
 * that, because the verdict never said which table it used.
 *
 * So the test that matters is that the explanation names the things a
 * person would need in order to disagree.
 */

const snapshot = (over: Partial<RulesSnapshot> = {}): RulesSnapshot => ({
  jurisdictionName: "Austin",
  utility: "Austin Water",
  stage: 0,
  stageName: "Conservation Stage",
  digit: 8,
  allowedDays: ["TUE"],
  allowedWindows: [{ start: "00:00", end: "10:00" }],
  verified: true,
  propertyClass: "commercial",
  irrigationType: "automatic",
  noStreetAddress: false,
  variance: null,
  ...over,
});

describe("what a verdict was measured against", () => {
  it("names the utility and the stage", () => {
    const e = explainVerdict(snapshot());
    expect(e.points.join(" ")).toContain("Austin Water is in Conservation Stage");
  });

  it("names the TABLE, which is the part that has been wrong before", () => {
    const e = explainVerdict(snapshot());
    expect(e.headline).toContain("commercial accounts with automatic in-ground");
  });

  it("distinguishes the drip table from the automatic one", () => {
    // Austin gives drip and hose-end a more generous schedule, and
    // applying the wrong one is exactly the shipped bug.
    const e = explainVerdict(snapshot({ irrigationType: "drip_or_hose" }));
    expect(e.headline).toContain("drip or hose-end");
  });

  it("distinguishes residential from commercial", () => {
    const e = explainVerdict(snapshot({ propertyClass: "residential" }));
    expect(e.headline).toContain("residential accounts");
  });

  it("says which digit drove the day, so the address can be checked", () => {
    const e = explainVerdict(snapshot());
    expect(e.points.join(" ")).toContain("ends in 8");
  });

  it("explains a meter with no address instead of inventing a digit", () => {
    const e = explainVerdict(snapshot({ noStreetAddress: true }));
    const text = e.points.join(" ");
    expect(text).toContain("no street address");
    expect(text).not.toContain("ends in");
  });

  it("spells out the days and hours in words, not codes", () => {
    const text = explainVerdict(snapshot()).points.join(" ");
    expect(text).toContain("Tuesday");
    expect(text).toContain("00:00–10:00");
  });

  it("reads properly with several days", () => {
    const text = explainVerdict(
      snapshot({ allowedDays: ["MON", "WED", "FRI"] })
    ).points.join(" ");
    expect(text).toContain("Monday, Wednesday and Friday");
  });
});

describe("when Driplin is not sure", () => {
  it("says so plainly rather than burying it", () => {
    const e = explainVerdict(snapshot({ verified: false }));
    expect(e.caveat).toContain("has not confirmed");
    expect(e.caveat).toContain("will not change any controller");
  });

  it("carries no caveat when the rules are confirmed", () => {
    expect(explainVerdict(snapshot()).caveat).toBeNull();
  });
});

describe("when a variance applied", () => {
  const withVariance = snapshot({
    variance: "large property variance AW-2026-4417, permitting Mon, Thu (05:00–11:00), expires 2026-12-31",
    allowedDays: ["MON", "THU"],
    allowedWindows: [{ start: "05:00", end: "11:00" }],
  });

  it("leads with the variance rather than rules that did not apply", () => {
    const e = explainVerdict(withVariance);
    expect(e.headline).toContain("variance");
    expect(e.points[0]).toContain("AW-2026-4417");
  });

  it("is explicit that the customer reported it, not Driplin", () => {
    const e = explainVerdict(withVariance);
    expect(e.points.join(" ")).toContain("has not verified it");
  });

  it("warns that a wrong variance makes the verdict wrong", () => {
    expect(explainVerdict(withVariance).caveat).toContain(
      "this verdict is wrong"
    );
  });
});
