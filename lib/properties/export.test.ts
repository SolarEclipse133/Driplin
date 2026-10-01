import { describe, expect, it } from "vitest";
import { activityCsv, csvCell, portfolioCsv, toCsv } from "./export";
import { parseImport } from "./import";

/**
 * Getting data back out.
 *
 * The test that matters most is the round trip: whatever Driplin exports,
 * its own importer must read back without loss. That is what makes export
 * a bulk-edit tool rather than a dead end, and it is the only way to know
 * the two formats have not drifted.
 */

describe("quoting a cell", () => {
  it("leaves ordinary text alone", () => {
    expect(csvCell("Zilker Terrace")).toBe("Zilker Terrace");
  });

  it("quotes a comma", () => {
    expect(csvCell("Oak Hill, Phase II")).toBe('"Oak Hill, Phase II"');
  });

  it("doubles an embedded quote", () => {
    expect(csvCell('The "Grove" HOA')).toBe('"The ""Grove"" HOA"');
  });

  it("quotes a newline rather than breaking the row", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it.each(["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)"])(
    "defuses %o so a spreadsheet shows it instead of running it",
    (value) => {
      // A property name imported from a client's spreadsheet ends up in
      // whatever Driplin exports next, which may be opened by a city
      // official rather than the customer.
      const cell = csvCell(value);
      expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
    }
  );
});

describe("the portfolio export", () => {
  const property = {
    name: "Zilker Terrace",
    street_number: "2108",
    no_street_address: false,
    street_name: "Barton Springs Rd",
    city: "Austin",
    zip: "78704",
    unit_count: 120,
    property_class: "commercial",
    irrigation_type: "automatic",
  };

  it("uses the import headings, so the two cannot drift", () => {
    const csv = portfolioCsv([property]);
    expect(csv.split("\r\n")[0]).toBe(
      "name,street number,street name,city,zip,unit count,property class,irrigation type"
    );
  });

  it("round-trips through Driplin's own importer", () => {
    const csv = portfolioCsv([property]);
    const parsed = parseImport(csv);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      name: "Zilker Terrace",
      streetNumber: "2108",
      streetName: "Barton Springs Rd",
      zip: "78704",
      unitCount: 120,
      propertyClass: "commercial",
      irrigationType: "automatic",
      noStreetAddress: false,
    });
  });

  it("round-trips a meter with no street address", () => {
    // Exporting a blank would re-import as "no address" by luck; "none" is
    // what the importer actually documents, so a median stays a median.
    const csv = portfolioCsv([
      { ...property, name: "Front median", street_number: null, no_street_address: true },
    ]);
    const parsed = parseImport(csv);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0].noStreetAddress).toBe(true);
    expect(parsed.rows[0].streetNumber).toBeNull();
  });

  it("round-trips drip irrigation", () => {
    const csv = portfolioCsv([{ ...property, irrigation_type: "drip_or_hose" }]);
    const parsed = parseImport(csv);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0].irrigationType).toBe("drip_or_hose");
  });

  it("round-trips a name containing a comma", () => {
    const csv = portfolioCsv([{ ...property, name: "Oak Hill, Phase II" }]);
    const parsed = parseImport(csv);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0].name).toBe("Oak Hill, Phase II");
  });

  it("round-trips a whole mixed portfolio", () => {
    const csv = portfolioCsv([
      property,
      { ...property, name: "Hill Country Villas", street_number: "1500", city: "Leander", zip: "78641" },
      { ...property, name: "Front median", street_number: null, no_street_address: true },
    ]);
    const parsed = parseImport(csv);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[1].jurisdiction).toBe("leander");
  });

  it("produces only a heading row for an empty portfolio", () => {
    expect(portfolioCsv([]).trim().split("\r\n")).toHaveLength(1);
  });
});

describe("the compliance log export", () => {
  const event = {
    created_at: "2026-07-15T17:30:00Z",
    type: "auto_correction",
    summary: "Schedule corrected to Tuesday.",
    property_name: "Zilker Terrace",
  };

  it("renders the date on the clock the rules are written on", () => {
    // 17:30 UTC in July is 12:30 Central. An unlabelled UTC timestamp in
    // an audit file invites the off-by-an-hour argument.
    const csv = activityCsv([event]);
    expect(csv).toContain("12:30");
    expect(csv.split("\r\n")[0]).toContain("Central");
  });

  it("gives an event type a name an auditor can read", () => {
    expect(activityCsv([event])).toContain("Corrected automatically");
  });

  it("falls back to the raw type rather than hiding an event", () => {
    const csv = activityCsv([{ ...event, type: "something_new" }]);
    expect(csv).toContain("something_new");
  });

  it("labels a portfolio-wide event rather than leaving a blank", () => {
    expect(activityCsv([{ ...event, property_name: null }])).toContain(
      "(portfolio-wide)"
    );
  });

  it("keeps a summary containing a comma on one row", () => {
    const csv = activityCsv([
      { ...event, summary: "Waters Mon, Wed; should be Tue." },
    ]);
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });
});

describe("the file as a whole", () => {
  it("ends with a newline, since some tools drop the last row without one", () => {
    expect(toCsv(["a"], [["1"]]).endsWith("\r\n")).toBe(true);
  });
});
