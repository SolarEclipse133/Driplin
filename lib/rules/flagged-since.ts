import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * When did the controller's current problem actually start?
 *
 * A controller that can't be corrected remotely is re-flagged on every
 * compliance run, so the most recent push_failed event is just the
 * last check — using it would say a three-day-old problem was six
 * hours old. The honest answer is the first failure since the last
 * time someone actually fixed it.
 */
export async function flaggedSince(
  supabase: SupabaseClient,
  controllerId: string
): Promise<string | null> {
  const { data: lastFix } = await supabase
    .from("manual_fix_confirmations")
    .select("created_at")
    .eq("controller_id", controllerId)
    .eq("verified", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = supabase
    .from("compliance_events")
    .select("created_at")
    .eq("controller_id", controllerId)
    .eq("type", "push_failed")
    .order("created_at", { ascending: true })
    .limit(1);

  if (lastFix?.created_at) query = query.gt("created_at", lastFix.created_at);

  const { data } = await query.maybeSingle();
  return data?.created_at ?? null;
}
