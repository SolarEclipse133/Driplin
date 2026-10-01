import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activityCsv } from "@/lib/properties/export";
import {
  centralCalendarDate,
  endOfCentralDay,
  startOfCentralDay,
} from "@/lib/dates/central";

export const dynamic = "force-dynamic";

/** A hard ceiling, so one request cannot try to stream a whole history. */
const MAX_ROWS = 10_000;

/**
 * GET /api/export/activity?from=YYYY-MM-DD&to=YYYY-MM-DD[&property=<id>]
 *
 * The compliance log as a file — what you hand a city or a board when
 * "we were compliant" needs to be more than an assertion.
 *
 * Dates are Central, resolved through the zone rather than a fixed offset,
 * for the same reason the PDF report is: an hour's drift at a period edge
 * silently moves events in and out of the record.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const propertyId = searchParams.get("property");

  const to = toParam ? endOfCentralDay(toParam) : new Date();
  const from = fromParam
    ? startOfCentralDay(fromParam)
    : new Date((to ?? new Date()).getTime() - 90 * 24 * 3600 * 1000);

  if (!to || !from || from > to) {
    return NextResponse.json(
      { error: "Invalid date range. Use from=YYYY-MM-DD&to=YYYY-MM-DD." },
      { status: 400 }
    );
  }

  let query = supabase
    .from("compliance_events")
    .select("created_at, type, summary, properties(name)")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not read the log" }, { status: 500 });
  }

  const events = (data ?? []).map((e) => {
    const property = Array.isArray(e.properties) ? e.properties[0] : e.properties;
    return {
      created_at: e.created_at as string,
      type: e.type as string,
      summary: e.summary as string,
      property_name: (property?.name as string) ?? null,
    };
  });

  const csv = activityCsv(events);
  const filename = `driplin-compliance-log-${centralCalendarDate()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
