import { IMPORT_TEMPLATE_HEADERS } from "./import";

/**
 * Getting data back out of Driplin.
 *
 * Two reasons this matters more than it looks. A property manager
 * evaluating a compliance product asks whether they can get their data out
 * again, and "no" is a reasonable place to stop the conversation. And the
 * compliance record itself is more useful handed to a city or a board as a
 * file than read off a screen.
 *
 * The portfolio export deliberately uses the IMPORT headers, so a customer
 * can export, edit in a spreadsheet, and import back — which is the only
 * bulk-edit Driplin needs to offer.
 */

/**
 * One CSV cell, quoted as the format requires.
 *
 * The leading-character guard is not decoration. Excel, Numbers and Sheets
 * treat a cell beginning =, +, - or @ as a formula, so a property named
 * =HYPERLINK(...) in an imported client spreadsheet becomes live content
 * in whatever Driplin exports next -- aimed at whoever opens the file,
 * which may be a city official rather than the customer. Prefixing a
 * single quote is the long-standing fix: spreadsheets show the text and
 * run nothing.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // A trailing newline: some tools drop the last row without one.
  return lines.join("\r\n") + "\r\n";
}

export interface ExportableProperty {
  name: string;
  street_number: string | null;
  no_street_address: boolean | null;
  street_name: string;
  city: string | null;
  zip: string;
  unit_count: number;
  property_class: string | null;
  irrigation_type: string | null;
}

/**
 * The portfolio, in the shape the importer reads back.
 *
 * A meter with no street address exports as "none", which is exactly what
 * the importer accepts for one -- so the round trip survives medians and
 * common areas rather than quietly turning them into addressed properties.
 */
export function portfolioCsv(properties: ExportableProperty[]): string {
  return toCsv(
    IMPORT_TEMPLATE_HEADERS,
    properties.map((p) => [
      p.name,
      p.no_street_address ? "none" : (p.street_number ?? "none"),
      p.street_name,
      p.city ?? "",
      p.zip,
      p.unit_count,
      p.property_class ?? "commercial",
      p.irrigation_type === "drip_or_hose" ? "drip" : "automatic",
    ])
  );
}

export interface ExportableEvent {
  created_at: string;
  type: string;
  summary: string;
  property_name: string | null;
}

export const ACTIVITY_HEADERS = [
  "date (Central)",
  "property",
  "event",
  "detail",
];

const EVENT_LABELS: Record<string, string> = {
  check: "Compliance check",
  violation: "Violation found",
  auto_correction: "Corrected automatically",
  push_failed: "Needs a manual fix",
  stage_confirmed: "Drought stage confirmed",
  manual_fix_confirmed: "Manual fix confirmed",
  variance_expiring: "Variance expiring",
  work_order_stale: "Work order unanswered",
  schedule_entered: "Schedule recorded by hand",
  controller_unreadable: "Controller could not be read",
};

/**
 * The compliance log, for an auditor rather than a dashboard.
 *
 * Dates are rendered in Central, because that is the clock the rules are
 * written on and the one whoever reads this is working from. An unlabelled
 * UTC timestamp in an audit file invites exactly the off-by-an-hour
 * argument this product exists to avoid.
 */
export function activityCsv(events: ExportableEvent[]): string {
  return toCsv(
    ACTIVITY_HEADERS,
    events.map((e) => [
      new Date(e.created_at).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        dateStyle: "short",
        timeStyle: "short",
      }),
      e.property_name ?? "(portfolio-wide)",
      EVENT_LABELS[e.type] ?? e.type,
      e.summary,
    ])
  );
}
