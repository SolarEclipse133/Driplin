import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entitlementsFor, type Entitlements } from "./plans";

/** Loads an organization's plan and works out what it may do. */
export async function getEntitlements(
  supabase: SupabaseClient,
  orgId: string
): Promise<Entitlements> {
  const [{ data: subscription }, { count }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, property_limit, trial_ends_at, current_period_end")
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  return entitlementsFor(subscription, count ?? 0);
}
