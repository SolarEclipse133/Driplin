import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { portfolioCsv } from "@/lib/properties/export";
import { centralCalendarDate } from "@/lib/dates/central";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/portfolio[?archived=1]
 *
 * The customer's properties, in the shape Driplin's own importer reads
 * back — so export, edit in a spreadsheet, re-import is a working loop.
 *
 * Authorisation is the session plus row-level security: the query below is
 * not filtered by organization in application code because it does not need
 * to be, and adding a filter would imply the policy could not be trusted.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const includeArchived =
    new URL(request.url).searchParams.get("archived") === "1";

  let query = supabase
    .from("properties")
    .select(
      "name, street_number, no_street_address, street_name, city, zip, unit_count, property_class, irrigation_type"
    )
    .order("name");
  // Archived properties are left out by default: re-importing the default
  // export should not resurrect properties that left the portfolio.
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not read properties" }, { status: 500 });
  }

  const csv = portfolioCsv(data ?? []);
  const filename = `driplin-properties-${centralCalendarDate()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
