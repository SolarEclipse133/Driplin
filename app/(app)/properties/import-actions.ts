"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/billing/subscription";
import {
  EMPTY_IMPORT_STATE,
  parseImport,
  type ImportRow,
  type ImportPreview,
  type ImportState,
} from "@/lib/properties/import";

const MAX_ROWS = 500;

/**
 * Read a portfolio out of a spreadsheet.
 *
 * Deliberately two steps. The first writes nothing and shows exactly
 * what would be created, including which of a city's published tables
 * each property would be judged against -- because the whole hazard of
 * an import is that one wrong column becomes forty wrong properties, all
 * in the same direction, with nobody looking at any individual row.
 *
 * The second step re-parses the file from scratch rather than trusting
 * anything the preview returned.
 */
export async function importProperties(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  const confirmed = formData.get("confirm") === "true";
  const skipDuplicates = formData.get("skip_duplicates") === "on";

  let csv = pasted;
  if (file instanceof File && file.size > 0) {
    csv = await file.text();
  }
  csv = csv.trim();

  const fail = (error: string): ImportState => ({
    ...EMPTY_IMPORT_STATE,
    error,
    csv: csv || null,
  });

  if (csv === "")
    return fail("Choose a CSV file, or paste the rows into the box.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You are no longer signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return fail("Your account has no organization.");

  // The portfolio as it stands, so a re-uploaded file is reported as
  // duplicates rather than quietly doubling it -- and the bill.
  const { data: existingRows } = await supabase
    .from("properties")
    .select("name, street_number, street_name")
    .is("archived_at", null);
  const existing = (existingRows ?? []).map((p) => ({
    name: p.name as string,
    streetNumber: (p.street_number as string | null) ?? null,
    streetName: p.street_name as string,
  }));

  const parsed = parseImport(csv, existing);

  if (parsed.rows.length > MAX_ROWS)
    return fail(
      `That file has ${parsed.rows.length} rows; Driplin imports up to ${MAX_ROWS} at a time. Split it and run it twice.`
    );

  const { JURISDICTIONS } = await import("@/lib/jurisdictions");
  const nameOf = (id: string) =>
    JURISDICTIONS.find((j) => j.id === id)?.name ?? id;

  const importable = parsed.rows.filter(
    (_r, i) => !parsed.duplicateOf.has(i + 2)
  );
  const duplicateCount = parsed.duplicateOf.size;

  // Would this exceed the plan? Checked against what would actually be
  // created, before anything is written.
  const entitlements = await getEntitlements(supabase, profile.org_id);
  const willCreate = skipDuplicates ? importable.length : parsed.rows.length;
  let blocked: string | null = null;
  if (
    entitlements.propertyLimit !== null &&
    entitlements.propertyCount + willCreate > entitlements.propertyLimit
  ) {
    blocked = `This would take you to ${entitlements.propertyCount + willCreate} properties, over your plan's limit of ${entitlements.propertyLimit}. Nothing has been imported.`;
  }

  const preview: ImportPreview = {
    rows: parsed.rows.map((r, i) => ({
      line: i + 2,
      name: r.name,
      address: r.noStreetAddress
        ? `${r.streetName} (no street address)`
        : `${r.streetNumber} ${r.streetName}`,
      units: r.unitCount,
      propertyClass: r.propertyClass,
      irrigationType: r.irrigationType,
      jurisdictionName: nameOf(r.jurisdiction),
      duplicateOf: parsed.duplicateOf.get(i + 2) ?? null,
    })),
    problems: parsed.problems,
    ignoredColumns: parsed.ignoredColumns,
    duplicateCount,
    blocked,
  };

  // Step one: show the person what would happen.
  if (!confirmed) {
    return { error: null, success: null, preview, csv };
  }

  // Step two. Everything below only runs on an explicit confirmation,
  // and only when the file is clean.
  if (parsed.problems.length > 0)
    return {
      error: `${parsed.problems.length} row${parsed.problems.length === 1 ? "" : "s"} still need fixing. Nothing has been imported — a partly-imported portfolio means a property nobody is watching that its manager believes is covered.`,
      success: null,
      preview,
      csv,
    };
  if (blocked) return { error: blocked, success: null, preview, csv };
  if (duplicateCount > 0 && !skipDuplicates)
    return {
      error: `${duplicateCount} of these are already in your portfolio. Tick "skip the ones I already have", or remove them from the file.`,
      success: null,
      preview,
      csv,
    };

  const toCreate = skipDuplicates ? importable : parsed.rows;
  const { error, count } = await supabase
    .from("properties")
    .insert(
      toCreate.map((r: ImportRow) => ({
        org_id: profile.org_id,
        name: r.name,
        street_number: r.streetNumber,
        no_street_address: r.noStreetAddress,
        street_name: r.streetName,
        city: r.city,
        state: r.state,
        zip: r.zip,
        unit_count: r.unitCount,
        property_class: r.propertyClass,
        irrigation_type: r.irrigationType,
        jurisdiction: r.jurisdiction,
      })),
      { count: "exact" }
    )
    .select("id");

  if (error)
    return {
      error:
        "The database refused the import, so nothing was created. This usually means a value the preview could not catch — tell us what the file contains and we will look.",
      success: null,
      preview,
      csv,
    };

  revalidatePath("/properties");
  revalidatePath("/dashboard");
  return {
    error: null,
    success: `Imported ${count ?? toCreate.length} propert${(count ?? toCreate.length) === 1 ? "y" : "ies"}${
      skipDuplicates && duplicateCount > 0
        ? `, skipping ${duplicateCount} already in your portfolio`
        : ""
    }. Connect a controller to each one so Driplin can start checking it.`,
    preview: null,
    csv: null,
  };
}
