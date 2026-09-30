import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLinkToken } from "@/lib/security/tokens";
import { getJurisdiction, type DroughtStage } from "@/lib/jurisdictions";

/**
 * Look up one property's board view from a link token.
 *
 * Like the vendor page, this is anonymous traffic reaching the
 * database, so it is deliberately narrow:
 *
 *   - keyed solely by the SHA-256 of the token; the raw token is never
 *     stored or compared directly
 *   - returns ONE property, and only what a board should see: name,
 *     status, the rules in force, recent activity. No portfolio, no
 *     other properties, no account or billing data, no credentials,
 *     no photos.
 *   - unknown, revoked and expired tokens are indistinguishable from
 *     outside: all yield null
 *
 * It uses the service-role client because there is no signed-in user
 * to scope by. That is safe here for the same reason it is on the
 * vendor page: no caller-supplied value ever selects a different row.
 */

export interface BoardView {
  propertyName: string;
  address: string;
  orgName: string;
  status: "compliant" | "needs_attention" | "unknown";
  statusLabel: string;
  jurisdictionName: string;
  utility: string;
  stageName: string;
  stageSummary: string;
  stageConfirmedAt: string | null;
  sourceLink: string | null;
  officialUrl: string;
  activity: { date: string; summary: string }[];
  checkedAt: string | null;
}

export async function findBoardView(token: string): Promise<BoardView | null> {
  if (!token || token.length < 20) return null;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return null;
  }

  const { data: link } = await supabase
    .from("board_links")
    .select("id, property_id, expires_at, revoked_at")
    .eq("token_hash", hashLinkToken(token))
    .maybeSingle();

  if (!link) return null;
  if (link.revoked_at) return null;
  if (new Date(link.expires_at as string).getTime() <= Date.now()) return null;

  const { data: property } = await supabase
    .from("properties")
    .select(
      "name, street_number, street_name, city, state, zip, jurisdiction, no_street_address, organizations(name), controllers(compliance_status, compliance_checked_at)"
    )
    .eq("id", link.property_id as string)
    .maybeSingle();
  if (!property) return null;

  const org = Array.isArray(property.organizations)
    ? property.organizations[0]
    : property.organizations;
  const controllers = Array.isArray(property.controllers) ? property.controllers : [];
  const statuses = controllers.map((c) => c.compliance_status as string);

  const status: BoardView["status"] =
    statuses.length === 0
      ? "unknown"
      : statuses.includes("needs_manual_fix") || statuses.includes("violation")
        ? "needs_attention"
        : statuses.every((s) => s === "compliant")
          ? "compliant"
          : "unknown";

  const jurisdiction = getJurisdiction(property.jurisdiction as string);
  const { data: stageRow } = await supabase
    .from("drought_stage_status")
    .select("current_stage, confirmed_at, source_link")
    .eq("jurisdiction", jurisdiction.id)
    .maybeSingle();
  const stage = (stageRow?.current_stage ?? 0) as DroughtStage;

  // Recent activity, in the board's language. Internal event types are
  // not exposed; the summary line is what a person reads anyway.
  const { data: events } = await supabase
    .from("compliance_events")
    .select("summary, created_at")
    .eq("property_id", link.property_id as string)
    .order("created_at", { ascending: false })
    .limit(8);

  // Record that someone looked, so the manager can tell whether the
  // board actually uses it. Best effort; never blocks the page.
  await supabase
    .from("board_links")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", link.id as string);

  const checkedAt = controllers
    .map((c) => c.compliance_checked_at as string | null)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return {
    propertyName: property.name as string,
    address: [
      property.no_street_address ? "" : property.street_number,
      property.street_name,
    ]
      .filter(Boolean)
      .join(" ") + `, ${property.city} ${property.zip}`,
    orgName: (org?.name as string) ?? "",
    status,
    statusLabel:
      status === "compliant"
        ? "Compliant with current watering rules"
        : status === "needs_attention"
          ? "Needs attention"
          : "Not yet checked",
    jurisdictionName: jurisdiction.name,
    utility: jurisdiction.utility,
    stageName: jurisdiction.stages[stage].name,
    stageSummary: jurisdiction.stages[stage].summary,
    stageConfirmedAt: (stageRow?.confirmed_at as string) ?? null,
    sourceLink: (stageRow?.source_link as string) ?? null,
    officialUrl: jurisdiction.officialUrl,
    activity: (events ?? []).map((e) => ({
      date: e.created_at as string,
      summary: e.summary as string,
    })),
    checkedAt,
  };
}
