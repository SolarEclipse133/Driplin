import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBenchmarks, type BenchmarkSummary } from "./benchmarks";

/**
 * Loads the history the response-time ranking is built from.
 *
 * Separate from benchmarks.ts on purpose: the arithmetic there is pure
 * and testable, and this is the part that talks to the database.
 */

/**
 * Six months. Older than that says more about whoever used to manage
 * the property than about how it is run now, and it keeps the query
 * cheap as the event log grows.
 */
const WINDOW_DAYS = 180;

export async function loadBenchmarks(
  supabase: SupabaseClient,
  properties: {
    id: string;
    name: string;
    controllers: { id: string; compliance_status: string | null }[];
  }[]
): Promise<BenchmarkSummary> {
  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const [{ data: flagEvents }, { data: confirmations }] = await Promise.all([
    supabase
      .from("compliance_events")
      .select("controller_id, created_at")
      .eq("type", "push_failed")
      .not("controller_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
    supabase
      .from("manual_fix_confirmations")
      .select("controller_id, property_id, created_at, verified")
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
  ]);

  return buildBenchmarks({
    properties: properties.map((p) => ({ id: p.id, name: p.name })),
    controllers: properties.flatMap((p) =>
      p.controllers.map((c) => ({
        id: c.id,
        propertyId: p.id,
        needsManualFix: c.compliance_status === "needs_manual_fix",
      }))
    ),
    flags: (flagEvents ?? []).map((e) => ({
      controllerId: e.controller_id as string,
      at: e.created_at as string,
    })),
    confirmations: (confirmations ?? []).map((c) => ({
      controllerId: c.controller_id as string | null,
      propertyId: c.property_id as string,
      at: c.created_at as string,
      verified: c.verified as boolean | null,
    })),
  });
}
