import { describe, expect, it } from "vitest";
import { parseCsv, parseImport } from "./import";

/**
 * Importing a portfolio from a spreadsheet.
 *
 * The reason this file is long: in a form, a mistake costs one property.
 * In an import, a mistake in a heading row costs the whole portfolio, in
 * the same direction, invisibly. The street NUMBER decides which day a
 * property may water; the class and irrigation type decide which of a
 * city's published tables applies at all.
 *
 * So the rule under test throughout is that Driplin refuses what it
 * cannot read instead of coercing it.
 */

const HEADER = "name,street number,street name,city,zip,unit count";
const file = (...lines: string[]) => [HEADER, ...lines].join("\n");

describe("splitting the file", () => {
  it("keeps a comma inside a quoted name", () => {
    // "Oak Hill, Phase II" is an ordinary property name. Splitting on
    // the comma would shift every later column -- including the street
    // number, and so the watering day.
    const rows = parseCsv('name,street number\n"Oak Hill, Phase II",1204');
    expect(rows[1]).toEqual(["Oak Hill, Phase II", "1204"]);
  });

  it("handles an escaped quote", () => {
    const rows = parseCsv('name\n"The ""Grove"" HOA"');
    expect(rows[1]).toEqual(['The "Grove" HOA']);
  });

  it("reads CRLF line endings as one break", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("drops the trailing blank lines every export adds", () => {
    expect(parseCsv("a,b\n1,2\n\n\n")).toHaveLength(2);
  });
});

describe("a clean file", () => {
  it("reads every field", () => {
    const r = parseImport(
      file("Zilker Terrace,2108,Barton Springs Rd,Austin,78704,120")
    );
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      name: "Zilker Terrace",
      streetNumber: "2108",
      streetName: "Barton Springs Rd",
      zip: "78704",
      unitCount: 120,
      noStreetAddress: false,
      jurisdiction: "austin",
    });
  });

  it("does not care what order the columns are in", () => {
    const r = parseImport(
      "zip,name,unit count,street name,street number\n78704,Zilker,120,Barton Springs Rd,2108"
    );
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ name: "Zilker", streetNumber: "2108" });
  });

  it("accepts the headings people actually type", () => {
    const r = parseImport(
      "Property Name,House Number,Street,Town,Postal Code,Doors\nZilker,2108,Barton Springs Rd,Austin,78704,120"
    );
    expect(r.problems).toEqual([]);
    expect(r.rows[0].unitCount).toBe(120);
  });

  it("reports extra columns rather than failing on them", () => {
    const r = parseImport(
      `${HEADER},manager,notes\nZilker,2108,Barton Springs Rd,Austin,78704,120,Dana,call first`
    );
    expect(r.problems).toEqual([]);
    expect(r.ignoredColumns).toEqual(["manager", "notes"]);
  });
});

describe("the street number, because it is the watering day", () => {
  it("accepts a trailing letter", () => {
    const r = parseImport(file("Zilker,1204B,Barton Springs Rd,Austin,78704,12"));
    expect(r.problems).toEqual([]);
    expect(r.rows[0].streetNumber).toBe("1204B");
  });

  it.each(["12-14", "1204 1/2", "N/1204", "twelve", "1204B2", "#1204"])(
    "refuses %o rather than guessing a digit from it",
    (streetNumber) => {
      const r = parseImport(
        file(`Zilker,${streetNumber},Barton Springs Rd,Austin,78704,12`)
      );
      expect(r.problems.some((p) => p.column === "street number")).toBe(true);
    }
  );

  it("treats a blank as a meter with no address", () => {
    // Medians and entryway strips genuinely have none, and the city rule
    // for such areas applies instead of an address digit.
    const r = parseImport(file("Front median,,Walsh Tarlton Ln,Austin,78746,1"));
    expect(r.problems).toEqual([]);
    expect(r.rows[0].noStreetAddress).toBe(true);
    expect(r.rows[0].streetNumber).toBeNull();
  });

  it.each(["none", "N/A", "median", "common area", "-"])(
    "accepts %o as saying there is no address",
    (value) => {
      const r = parseImport(file(`Median,${value},Walsh Tarlton Ln,Austin,78746,1`));
      expect(r.problems).toEqual([]);
      expect(r.rows[0].noStreetAddress).toBe(true);
    }
  );

  it("insists the column exists at all", () => {
    const r = parseImport("name,street name,zip,unit count\nZilker,Barton Springs Rd,78704,12");
    expect(r.rows).toEqual([]);
    expect(r.problems.some((p) => p.column === "street number")).toBe(true);
  });
});

describe("the class and irrigation type, because they pick the table", () => {
  it("defaults to commercial automatic, which is what a portfolio is", () => {
    const r = parseImport(file("Zilker,2108,Barton Springs Rd,Austin,78704,120"));
    expect(r.rows[0].propertyClass).toBe("commercial");
    expect(r.rows[0].irrigationType).toBe("automatic");
  });

  it.each([
    ["HOA", "commercial"],
    ["multifamily", "commercial"],
    ["Residential", "residential"],
    ["single family", "residential"],
  ])("reads %o as %s", (given, expected) => {
    const r = parseImport(
      `${HEADER},property class\nZilker,2108,Barton Springs Rd,Austin,78704,120,${given}`
    );
    expect(r.problems).toEqual([]);
    expect(r.rows[0].propertyClass).toBe(expected);
  });

  it.each([
    ["drip", "drip_or_hose"],
    ["hose-end", "drip_or_hose"],
    ["sprinklers", "automatic"],
  ])("reads irrigation %o as %s", (given, expected) => {
    const r = parseImport(
      `${HEADER},irrigation type\nZilker,2108,Barton Springs Rd,Austin,78704,120,${given}`
    );
    expect(r.problems).toEqual([]);
    expect(r.rows[0].irrigationType).toBe(expected);
  });

  it("refuses a class it does not recognise instead of defaulting", () => {
    // Defaulting forty rows the wrong way is how a portfolio ends up
    // judged against a table written for different accounts.
    const r = parseImport(
      `${HEADER},property class\nZilker,2108,Barton Springs Rd,Austin,78704,120,mixed use`
    );
    expect(r.problems.some((p) => p.column === "property class")).toBe(true);
  });

  it("refuses an irrigation type it does not recognise", () => {
    const r = parseImport(
      `${HEADER},irrigation type\nZilker,2108,Barton Springs Rd,Austin,78704,120,rotors and drip`
    );
    expect(r.problems.some((p) => p.column === "irrigation type")).toBe(true);
  });
});

describe("the city, because it picks whose rules apply", () => {
  it("maps a covered city to its jurisdiction", () => {
    const r = parseImport(file("Hill Country,1500,Parmer Ln,Leander,78641,40"));
    expect(r.problems).toEqual([]);
    expect(r.rows[0].jurisdiction).toBe("leander");
  });

  it("refuses a city Driplin has no published rules for", () => {
    // Silently judging a Dallas property against Austin's table is the
    // worst outcome available here, so it is an error, not a default.
    const r = parseImport(file("Preston Hollow,4200,Walnut Hill Ln,Dallas,75229,80"));
    expect(r.problems.some((p) => p.column === "city")).toBe(true);
  });

  it("lets an explicit jurisdiction column override the city", () => {
    const r = parseImport(
      `${HEADER},jurisdiction\nWells Branch,1800,Wells Port Dr,Pflugerville,78660,60,Austin`
    );
    expect(r.problems).toEqual([]);
    expect(r.rows[0].jurisdiction).toBe("austin");
  });
});

describe("rejecting the rest", () => {
  it("names the line and column of every problem", () => {
    const r = parseImport(
      file(
        "Good,2108,Barton Springs Rd,Austin,78704,120",
        ",1204,Oak St,Austin,78704,12",
        "Bad zip,1206,Oak St,Austin,787,12"
      )
    );
    // Line 3 is the nameless one, line 4 the bad ZIP -- counted as the
    // person sees them in the file, heading row included.
    expect(r.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 3, column: "name" }),
        expect.objectContaining({ line: 4, column: "zip" }),
      ])
    );
  });

  it.each(["787", "787044", "ABCDE", ""])("refuses the ZIP %o", (zip) => {
    const r = parseImport(file(`Zilker,2108,Barton Springs Rd,Austin,${zip},12`));
    expect(r.problems.some((p) => p.column === "zip")).toBe(true);
  });

  it.each(["0", "-4", "2.5", "lots", ""])("refuses the unit count %o", (units) => {
    const r = parseImport(file(`Zilker,2108,Barton Springs Rd,Austin,78704,${units}`));
    expect(r.problems.some((p) => p.column === "unit count")).toBe(true);
  });

  it("reports an empty file", () => {
    expect(parseImport("").problems).toHaveLength(1);
  });

  it("reports a heading row with nothing under it", () => {
    const r = parseImport(HEADER);
    expect(r.rows).toEqual([]);
    expect(r.problems.some((p) => p.column === "file")).toBe(true);
  });
});

describe("duplicates", () => {
  const existing = [
    { name: "Zilker Terrace", streetNumber: "2108", streetName: "Barton Springs Rd" },
  ];

  it("flags a property already in the portfolio by name", () => {
    // Re-uploading last month's file must not double someone's
    // portfolio, or their bill.
    const r = parseImport(
      file("Zilker Terrace,2108,Barton Springs Rd,Austin,78704,120"),
      existing
    );
    expect(r.duplicateOf.get(2)).toBe("Zilker Terrace");
  });

  it("matches a name regardless of case and surrounding space", () => {
    const r = parseImport(
      file("  zilker terrace ,2108,Barton Springs Rd,Austin,78704,120"),
      existing
    );
    expect(r.duplicateOf.get(2)).toBe("Zilker Terrace");
  });

  it("flags the same address under a different name", () => {
    const r = parseImport(
      file("Zilker Phase 2,2108,Barton Springs Rd,Austin,78704,120"),
      existing
    );
    expect(r.duplicateOf.get(2)).toBe("Zilker Terrace");
  });

  it("treats the same name twice in one file as an error", () => {
    const r = parseImport(
      file(
        "Oak Grove,1204,Oak St,Austin,78704,12",
        "Oak Grove,1206,Oak St,Austin,78704,14"
      )
    );
    expect(r.problems.some((p) => p.line === 3 && p.column === "name")).toBe(true);
  });

  it("leaves a genuinely new property alone", () => {
    const r = parseImport(file("Oak Grove,1204,Oak St,Austin,78704,12"), existing);
    expect(r.problems).toEqual([]);
    expect(r.duplicateOf.size).toBe(0);
  });
});
