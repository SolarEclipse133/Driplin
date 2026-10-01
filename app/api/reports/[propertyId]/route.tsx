import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { BoardReport } from "@/lib/reports/board-report";
import { gatherReportData } from "@/lib/reports/gather";
import { endOfCentralDay, startOfCentralDay } from "@/lib/dates/central";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/[propertyId]?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns the board-ready compliance PDF. Auth comes from the session
 * cookie; row-level security guarantees the caller can only report on
 * their own org's properties.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/reports/[propertyId]">
) {
  const { propertyId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Period: default to the last 90 days. The dates are Central ones, and
  // resolving them needs the zone rather than a fixed offset -- see
  // lib/dates/central. This used to hardcode -06:00, which is CST, so for
  // the eight months of CDT the window sat an hour late and quietly
  // dropped events from the start of the period.
  const { searchParams } = new URL(request.url);
  const toParam = searchParams.get("to");
  const fromParam = searchParams.get("from");

  const to = toParam ? endOfCentralDay(toParam) : new Date();
  const from = fromParam
    ? startOfCentralDay(fromParam)
    : new Date((to ?? new Date()).getTime() - 90 * 24 * 3600 * 1000);

  // A date Driplin cannot read is refused rather than silently becoming
  // today, which would put the wrong period in the report's own heading.
  if (!to || !from || from > to) {
    return NextResponse.json(
      { error: "Invalid date range. Use from=YYYY-MM-DD&to=YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const data = await gatherReportData(supabase, propertyId, from, to);
  if (!data) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const buffer = await renderToBuffer(<BoardReport data={data} />);
  const filename = `driplin-report-${data.property.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
