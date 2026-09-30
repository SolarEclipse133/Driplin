import { describe, expect, it } from "vitest";
import { getJurisdiction, resolveSchedule, type DroughtStage } from "./index";
import { getWateringDigit } from "@/lib/rules/address";

/**
 * The watering-day tables, checked against each utility's own published
 * schedule.
 *
 * This is the most safety-critical code in Driplin. If a table is
 * wrong, Driplin does not merely fail to help — it actively rewrites a
 * customer's controller onto a day their city prohibits, and tells them
 * it did so. That has happened: Austin and Leander both shipped wrong
 * tables that looked entirely plausible.
 *
 * Every expectation below is a quotation from a utility, cited. If one
 * fails, do not adjust the test to match the code. Re-read the city's
 * page and fix whichever is wrong.
 */

function dayFor(
  city: string,
  stage: DroughtStage,
  address: string,
  propertyClass: "residential" | "commercial",
  irrigationType: "automatic" | "drip_or_hose" = "automatic"
) {
  const digit = getWateringDigit(address);
  expect(digit, `"${address}" should be a usable street number`).not.toBeNull();
  return resolveSchedule(getJurisdiction(city).stages[stage], {
    propertyClass,
    irrigationType,
  }).daysByDigit[digit!];
}

describe("Austin — austintexas.gov/water/find-your-watering-day", () => {
  // Austin is the only city that splits by BOTH property class and
  // irrigation type. Commercial and multifamily is Driplin's entire
  // customer base, so the commercial rows matter most.
  describe("Conservation Stage, automatic irrigation", () => {
    it("residential: even addresses Thursday, odd Wednesday", () => {
      expect(dayFor("austin", 0, "1204", "residential")).toEqual(["THU"]);
      expect(dayFor("austin", 0, "1205", "residential")).toEqual(["WED"]);
    });

    it("commercial and multifamily: even addresses Tuesday, odd Friday", () => {
      expect(dayFor("austin", 0, "1204", "commercial")).toEqual(["TUE"]);
      expect(dayFor("austin", 0, "1205", "commercial")).toEqual(["FRI"]);
    });

    it("never gives a commercial account the residential day", () => {
      for (const n of ["1200", "1201", "1202", "1203", "1204", "1205", "1206", "1207", "1208", "1209"]) {
        const commercial = dayFor("austin", 0, n, "commercial");
        const residential = dayFor("austin", 0, n, "residential");
        expect(commercial).not.toEqual(residential);
      }
    });
  });

  describe("Conservation Stage, drip and hose-end", () => {
    it("residential: even Thursday+Sunday, odd Wednesday+Saturday", () => {
      expect(dayFor("austin", 0, "1204", "residential", "drip_or_hose")).toEqual(["THU", "SUN"]);
      expect(dayFor("austin", 0, "1205", "residential", "drip_or_hose")).toEqual(["WED", "SAT"]);
    });

    it("commercial: Tuesday and Friday regardless of address", () => {
      for (const n of ["1200", "1207", "1208", "1209"]) {
        expect(dayFor("austin", 0, n, "commercial", "drip_or_hose")).toEqual(["TUE", "FRI"]);
      }
    });
  });

  describe("stages Austin does not publish a day table for", () => {
    // Austin's ordinance sets hours per stage but assigns no days; the
    // day table is published only for the stage currently in force.
    it.each([1, 2, 3, 4] as DroughtStage[])(
      "stage %i makes no judgement rather than guessing",
      (stage) => {
        const rule = getJurisdiction("austin").stages[stage];
        expect(rule.verified).toBe(false);
        expect(rule.scheduleUnknown).toBe(true);
      }
    );

    it("stage 4 does not claim irrigation is banned outright", () => {
      // The 2024 Drought Contingency Plan permits once a week for six
      // hours even in Stage 4.
      expect(getJurisdiction("austin").stages[4].summary).not.toMatch(/No automatic irrigation allowed/i);
      expect(getJurisdiction("austin").stages[4].summary).toMatch(/six hours/i);
    });
  });
});

describe("Leander — leandertx.gov, Phase 2", () => {
  // Leander splits by property class exactly as Austin does, and the
  // digit comes from "the address where your water meter is located".
  it("residential: 1/5/9 Friday, 2/4/6/8 Wednesday, 0/3/7 Sunday", () => {
    for (const n of ["101", "105", "109"]) expect(dayFor("leander", 2, n, "residential")).toEqual(["FRI"]);
    for (const n of ["102", "104", "106", "108"]) expect(dayFor("leander", 2, n, "residential")).toEqual(["WED"]);
    for (const n of ["100", "103", "107"]) expect(dayFor("leander", 2, n, "residential")).toEqual(["SUN"]);
  });

  it("commercial: 1/5/9 Tuesday, 2/4/6/8 Saturday, 0/3/7 Thursday", () => {
    for (const n of ["101", "105", "109"]) expect(dayFor("leander", 2, n, "commercial")).toEqual(["TUE"]);
    for (const n of ["102", "104", "106", "108"]) expect(dayFor("leander", 2, n, "commercial")).toEqual(["SAT"]);
    for (const n of ["100", "103", "107"]) expect(dayFor("leander", 2, n, "commercial")).toEqual(["THU"]);
  });

  it("irrigation type makes no difference — Phase 2 covers all methods", () => {
    expect(dayFor("leander", 2, "105", "commercial", "drip_or_hose")).toEqual(
      dayFor("leander", 2, "105", "commercial", "automatic")
    );
  });
});

describe("cities that publish one table for everyone", () => {
  // Verified September 2026 against each utility. If a city later
  // introduces a class split, these tests should start failing.
  const SAME_FOR_ALL: [string, DroughtStage, Record<string, string[]>][] = [
    // saws.org/conservation/drought-restrictions/stage-2/
    ["san_antonio", 2, { "100": ["MON"], "101": ["MON"], "102": ["TUE"], "103": ["TUE"], "104": ["WED"], "105": ["WED"], "106": ["THU"], "107": ["THU"], "108": ["FRI"], "109": ["FRI"] }],
    // roundrocktexas.gov — 4/8 Sun+Thu, 0/3 Mon+Thu, 2/6/7 Tue+Fri, 1/5/9 Wed+Sat
    ["round_rock", 0, { "104": ["SUN", "THU"], "108": ["SUN", "THU"], "100": ["MON", "THU"], "103": ["MON", "THU"], "102": ["TUE", "FRI"], "106": ["TUE", "FRI"], "107": ["TUE", "FRI"], "101": ["WED", "SAT"], "105": ["WED", "SAT"], "109": ["WED", "SAT"] }],
    // Georgetown Utility Systems — 1/5/9 Tue+Fri, 2/4/6/8 Wed+Sat, 0/3/7 Thu+Sun
    ["georgetown", 0, { "101": ["TUE", "FRI"], "105": ["TUE", "FRI"], "109": ["TUE", "FRI"], "102": ["WED", "SAT"], "104": ["WED", "SAT"], "106": ["WED", "SAT"], "108": ["WED", "SAT"], "100": ["THU", "SUN"], "103": ["THU", "SUN"], "107": ["THU", "SUN"] }],
  ];

  it.each(SAME_FOR_ALL)("%s stage %i matches the published table", (city, stage, table) => {
    for (const [address, days] of Object.entries(table)) {
      expect(dayFor(city, stage, address, "commercial"), `${city} ${address}`).toEqual(days);
      expect(dayFor(city, stage, address, "residential"), `${city} ${address} residential`).toEqual(days);
    }
  });
});

describe("San Antonio — areas with no street address", () => {
  // "Areas without a street address, such as medians and neighborhood
  // entryways, water on Wednesday." Stated identically on the Stage 2
  // and Stage 3 pages.
  it.each([1, 2, 3] as DroughtStage[])("stage %i waters them on Wednesday", (stage) => {
    const schedule = resolveSchedule(getJurisdiction("san_antonio").stages[stage], {
      propertyClass: "commercial",
      irrigationType: "automatic",
      noStreetAddress: true,
    });
    expect(schedule.daysByDigit[0]).toEqual(["WED"]);
  });
});
