import type { IrrigationType, PropertyClass } from "@/lib/jurisdictions";
import { JURISDICTIONS, jurisdictionForCity } from "@/lib/jurisdictions";

/**
 * Reading a portfolio out of a spreadsheet.
 *
 * This is where most trials die: a property manager with forty
 * properties types them in one at a time, or does not.
 *
 * It is also where a single mistake stops being a single mistake. The
 * street NUMBER decides which day a property may water, and the class
 * and irrigation type decide which of a city's published tables applies
 * at all. Get a column wrong in a form and one property is wrong; get it
 * wrong in a header row and forty are, quietly, in the same direction.
 *
 * So this module guesses at nothing. Every row is validated before
 * anything is written, a bad value is reported by line and column rather
 * than coerced, and a file either imports completely or not at all --
 * because a silently skipped row is an unmonitored property that its
 * manager believes is covered.
 */

export interface ImportRow {
  name: string;
  streetNumber: string | null;
  noStreetAddress: boolean;
  streetName: string;
  city: string;
  state: string;
  zip: string;
  unitCount: number;
  propertyClass: PropertyClass;
  irrigationType: IrrigationType;
  jurisdiction: string;
}

export interface RowProblem {
  /** 1-based line in the file as the person sees it, header included. */
  line: number;
  column: string;
  message: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  problems: RowProblem[];
  /** Rows that match a property already in the portfolio. */
  duplicateOf: Map<number, string>;
  /** Headers found in the file that Driplin does not use. */
  ignoredColumns: string[];
}

/** The header each field accepts, lowercased, spaces and underscores alike. */
const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "property", "property name", "community", "community name"],
  streetNumber: ["street number", "number", "street no", "house number", "address number"],
  streetName: ["street name", "street", "address", "road"],
  city: ["city", "town"],
  state: ["state"],
  zip: ["zip", "zip code", "postal code", "postcode"],
  unitCount: ["unit count", "units", "unit", "doors", "homes"],
  propertyClass: ["property class", "class", "account class", "type"],
  irrigationType: ["irrigation type", "irrigation", "system", "system type"],
  jurisdiction: ["jurisdiction", "utility", "water provider", "water utility"],
};

const CLASS_VALUES: Record<string, PropertyClass> = {
  commercial: "commercial",
  comm: "commercial",
  hoa: "commercial",
  multifamily: "commercial",
  "multi-family": "commercial",
  apartment: "commercial",
  apartments: "commercial",
  residential: "residential",
  res: "residential",
  "single family": "residential",
  "single-family": "residential",
  home: "residential",
};

const IRRIGATION_VALUES: Record<string, IrrigationType> = {
  automatic: "automatic",
  auto: "automatic",
  "in-ground": "automatic",
  "in ground": "automatic",
  sprinkler: "automatic",
  sprinklers: "automatic",
  spray: "automatic",
  drip: "drip_or_hose",
  drip_or_hose: "drip_or_hose",
  "drip or hose": "drip_or_hose",
  "hose-end": "drip_or_hose",
  "hose end": "drip_or_hose",
  hose: "drip_or_hose",
  soaker: "drip_or_hose",
};

/** Values that mean "this meter genuinely has no street address". */
const NO_ADDRESS_VALUES = [
  "none", "n/a", "na", "no address", "no street address", "median",
  "common area", "-", "--",
];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Split CSV text into rows of cells.
 *
 * Written out rather than split on commas, because a property called
 * "Oak Hill, Phase II" is entirely ordinary and splitting on the comma
 * would shift every column after it -- including the street number, and
 * therefore the watering day.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      // Swallow CRLF as one break.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  rows.push(row);

  // Drop trailing blank lines, which every spreadsheet export adds.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ExistingProperty {
  name: string;
  streetNumber: string | null;
  streetName: string;
}

/**
 * Validate a whole file without writing anything.
 *
 * `existing` is the portfolio as it stands, so a re-uploaded file is
 * reported as duplicates rather than quietly doubling someone's
 * portfolio -- and their bill.
 */
export function parseImport(
  text: string,
  existing: ExistingProperty[] = []
): ParsedImport {
  const table = parseCsv(text);
  const problems: RowProblem[] = [];
  const rows: ImportRow[] = [];
  const duplicateOf = new Map<number, string>();

  if (table.length === 0) {
    return {
      rows: [],
      problems: [{ line: 1, column: "file", message: "The file is empty." }],
      duplicateOf,
      ignoredColumns: [],
    };
  }

  // Map each field to the column it was found in.
  const headers = table[0].map(normalizeHeader);
  const columnOf: Partial<Record<keyof typeof FIELD_ALIASES, number>> = {};
  const used = new Set<number>();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) {
      columnOf[field as keyof typeof FIELD_ALIASES] = idx;
      used.add(idx);
    }
  }
  const ignoredColumns = headers
    .map((h, i) => (used.has(i) || h === "" ? null : table[0][i].trim()))
    .filter((h): h is string => h !== null);

  // Without these there is nothing to import. Named individually so the
  // person is told which header to add rather than "bad file".
  for (const required of ["name", "streetName", "zip", "unitCount"] as const) {
    if (columnOf[required] === undefined) {
      problems.push({
        line: 1,
        column: FIELD_ALIASES[required][0],
        message: `No "${FIELD_ALIASES[required][0]}" column found. Accepted headings: ${FIELD_ALIASES[required].join(", ")}.`,
      });
    }
  }
  if (columnOf.streetNumber === undefined) {
    problems.push({
      line: 1,
      column: "street number",
      message:
        'No "street number" column found. Driplin needs it because most cities assign the watering day by the last digit of the address.',
    });
  }
  if (problems.length > 0) {
    return { rows: [], problems, duplicateOf, ignoredColumns };
  }

  const cell = (r: string[], field: keyof typeof FIELD_ALIASES): string => {
    const idx = columnOf[field];
    return idx === undefined ? "" : (r[idx] ?? "").trim();
  };

  // Names already taken, and addresses already present.
  const existingNames = new Map(
    existing.map((e) => [e.name.trim().toLowerCase(), e.name])
  );
  const existingAddresses = new Map(
    existing
      .filter((e) => e.streetNumber)
      .map((e) => [
        `${e.streetNumber!.toLowerCase()} ${e.streetName.trim().toLowerCase()}`,
        e.name,
      ])
  );
  // And names appearing twice within the file itself.
  const seenInFile = new Map<string, number>();

  for (let i = 1; i < table.length; i++) {
    const line = i + 1;
    const r = table[i];
    const add = (column: string, message: string) =>
      problems.push({ line, column, message });

    const name = cell(r, "name");
    if (name === "") add("name", "A property needs a name.");

    // Street number, or an explicit statement that there isn't one.
    const rawNumber = cell(r, "streetNumber");
    let streetNumber: string | null = null;
    let noStreetAddress = false;
    if (rawNumber === "" || NO_ADDRESS_VALUES.includes(rawNumber.toLowerCase())) {
      // A median or entryway strip genuinely has no address. Blank is
      // accepted as meaning that, but it is surfaced in the preview so
      // nobody discovers it later.
      noStreetAddress = true;
    } else if (!/^[0-9]+[A-Za-z]?$/.test(rawNumber)) {
      add(
        "street number",
        `"${rawNumber}" is not a street number Driplin can read a watering digit from. Use digits with an optional letter, e.g. 1204 or 1204B. For a median or common area with no address, write "none".`
      );
    } else {
      streetNumber = rawNumber;
    }

    const streetName = cell(r, "streetName");
    if (streetName === "") add("street name", "A property needs a street name.");

    const zip = cell(r, "zip");
    if (!/^[0-9]{5}$/.test(zip)) {
      add("zip", `"${zip}" is not a five-digit ZIP code.`);
    }

    const rawUnits = cell(r, "unitCount");
    const unitCount = Number(rawUnits);
    if (!Number.isInteger(unitCount) || unitCount < 1) {
      add(
        "unit count",
        `"${rawUnits}" is not a whole number of units. Use 1 if it is a single common area.`
      );
    }

    // Class and irrigation type decide WHICH published table a property
    // is judged against, so an unrecognised value is refused rather than
    // defaulted. Defaulting forty rows the wrong way is exactly how a
    // portfolio ends up judged against a table written for someone else.
    const rawClass = cell(r, "propertyClass");
    let propertyClass: PropertyClass = "commercial";
    if (rawClass !== "") {
      const found = CLASS_VALUES[rawClass.toLowerCase()];
      if (!found) {
        add(
          "property class",
          `"${rawClass}" is not a class Driplin recognises. Use "commercial" (HOA common areas, multifamily) or "residential".`
        );
      } else {
        propertyClass = found;
      }
    }

    const rawIrrigation = cell(r, "irrigationType");
    let irrigationType: IrrigationType = "automatic";
    if (rawIrrigation !== "") {
      const found = IRRIGATION_VALUES[rawIrrigation.toLowerCase()];
      if (!found) {
        add(
          "irrigation type",
          `"${rawIrrigation}" is not an irrigation type Driplin recognises. Use "automatic" or "drip".`
        );
      } else {
        irrigationType = found;
      }
    }

    const rawJurisdiction = cell(r, "jurisdiction");
    const city = cell(r, "city");
    let jurisdiction = "austin";
    if (rawJurisdiction !== "") {
      const needle = rawJurisdiction.trim().toLowerCase();
      const match =
        JURISDICTIONS.find((j) => j.id === needle.replace(/\s+/g, "-")) ??
        JURISDICTIONS.find((j) => j.name.toLowerCase() === needle) ??
        JURISDICTIONS.find((j) => j.utility.toLowerCase() === needle) ??
        jurisdictionForCity(rawJurisdiction);
      if (!match) {
        add(
          "jurisdiction",
          `Driplin does not have published watering rules for "${rawJurisdiction}" yet. Supported: ${JURISDICTIONS.map((j) => j.name).join(", ")}.`
        );
      } else {
        jurisdiction = match.id;
      }
    } else if (city !== "") {
      // Fall back to the city using the registry's own lookup. Only an
      // exact match counts -- a near-guess means the wrong city's rules,
      // and a city Driplin does not cover is reported, not assumed to be
      // Austin, because silently judging a Dallas property against
      // Austin's table is the worst outcome available here.
      const match = jurisdictionForCity(city);
      if (!match) {
        add(
          "city",
          `Driplin does not have published watering rules for "${city}" yet. Supported: ${JURISDICTIONS.map((j) => j.name).join(", ")}. Add a "jurisdiction" column if the water provider differs from the city.`
        );
      } else {
        jurisdiction = match.id;
      }
    }

    // Duplicates, inside the file and against the existing portfolio.
    const key = name.trim().toLowerCase();
    if (name !== "") {
      const earlier = seenInFile.get(key);
      if (earlier !== undefined) {
        add("name", `The same name appears on line ${earlier}.`);
      } else {
        seenInFile.set(key, line);
      }
      if (existingNames.has(key)) {
        duplicateOf.set(line, existingNames.get(key)!);
      }
    }
    if (streetNumber && streetName) {
      const addr = `${streetNumber.toLowerCase()} ${streetName.toLowerCase()}`;
      const owner = existingAddresses.get(addr);
      if (owner && !duplicateOf.has(line)) duplicateOf.set(line, owner);
    }

    rows.push({
      name,
      streetNumber,
      noStreetAddress,
      streetName,
      city: city || "Austin",
      state: cell(r, "state") || "TX",
      zip,
      unitCount,
      propertyClass,
      irrigationType,
      jurisdiction,
    });
  }

  if (rows.length === 0 && problems.length === 0) {
    problems.push({
      line: 1,
      column: "file",
      message: "The file has a heading row but no properties under it.",
    });
  }

  return { rows, problems, duplicateOf, ignoredColumns };
}

/** The heading row Driplin hands out as a starting point. */
export const IMPORT_TEMPLATE_HEADERS = [
  "name",
  "street number",
  "street name",
  "city",
  "zip",
  "unit count",
  "property class",
  "irrigation type",
];

/* ------------------------------------------------------------------
 * The shape the import form exchanges with its server action.
 *
 * It lives here rather than beside the action because a "use server"
 * module may only export async functions, and the client form needs the
 * empty state to start from.
 * ------------------------------------------------------------------ */

export interface ImportPreview {
  /** What would be created, in file order. */
  rows: {
    line: number;
    name: string;
    address: string;
    units: number;
    propertyClass: string;
    irrigationType: string;
    jurisdictionName: string;
    /** Name of the property this duplicates, if any. */
    duplicateOf: string | null;
  }[];
  problems: RowProblem[];
  ignoredColumns: string[];
  duplicateCount: number;
  /** Set when the import cannot go ahead at all. */
  blocked: string | null;
}

export type ImportState = {
  error: string | null;
  success: string | null;
  preview: ImportPreview | null;
  /** Echoed back so the confirm step resubmits the same file. */
  csv: string | null;
};

export const EMPTY_IMPORT_STATE: ImportState = {
  error: null,
  success: null,
  preview: null,
  csv: null,
};
