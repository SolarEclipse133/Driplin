import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DroughtStage, Jurisdiction } from "@/lib/jurisdictions";
import { dispatchAlertNotifications } from "@/lib/notifications/dispatch";
import { runComplianceForOrg, type OrgComplianceSummary } from "./run-compliance";
import { buildStageChangeDigest } from "./stage-change";

/**
 * A city changed the rules: re-check everyone affected and tell them.
 *
 * Done inline, on confirmation, rather than left to the nightly run. A
 * stage change can make a whole city's properties illegal at once, and
 * waiting until 3am means a day of watering nobody was warned about.
 *
 * One message per organization, not one per controller. Forty alerts from
 * a single cause is how people learn to filter Driplin's mail, and then
 * miss the one that matters -- so runComplianceForOrg is asked to record
 * its alerts without sending them, and the digest goes out instead.
 */

/**
 * How many organizations to re-check before handing the rest to tonight.
 *
 * Each one syncs every controller it owns, which is network-bound, and
 * this runs inside an admin's request. Deferring is safe -- the nightly
 * run does the same work -- and is reported rather than hidden.
 */
const MAX_ORGS_INLINE = 12;

export interface StageChangeResult {
  orgsChecked: number;
  deferred: number;
  notified: number;
  /** The confirming admin's own org, for the message they see. */
  ownSummary: OrgComplianceSummary;
}

const EMPTY_SUMMARY: OrgComplianceSummary = {
  checked: 0,
  compliant: 0,
  corrected: 0,
  needsManualFix: 0,
  uncertified: 0,
  chased: 0,
  unreadable: 0,
  errors: [],
  affected: [],
};

export async function notifyStageChange(
  supabase: SupabaseClient,
  jurisdiction: Jurisdiction,
  stage: DroughtStage,
  previousStageName: string | null,
  sourceLink: string,
  adminOrgId?: string
): Promise<StageChangeResult> {
  // Who has property in this city? Archived properties are excluded:
  // they are not monitored, so their owners are not affected by this.
  const { data: properties } = await supabase
    .from("properties")
    .select("org_id, jurisdiction")
    .eq("jurisdiction", jurisdiction.id)
    .is("archived_at", null);

  const countByOrg = new Map<string, number>();
  for (const p of properties ?? []) {
    const orgId = p.org_id as string;
    countByOrg.set(orgId, (countByOrg.get(orgId) ?? 0) + 1);
  }

  // The confirming admin's own org first, so the message they see is
  // about work that definitely happened.
  const orgIds = [...countByOrg.keys()].sort((a, b) =>
    a === adminOrgId ? -1 : b === adminOrgId ? 1 : 0
  );

  let ownSummary = EMPTY_SUMMARY;
  let notified = 0;
  const toProcess = orgIds.slice(0, MAX_ORGS_INLINE);

  for (const orgId of toProcess) {
    // digestAlerts: record the per-controller alerts, send none of them.
    const summary = await runComplianceForOrg(supabase, orgId, {
      digestAlerts: true,
    });
    if (orgId === adminOrgId) ownSummary = summary;

    const digest = buildStageChangeDigest({
      utility: jurisdiction.utility,
      cityName: jurisdiction.name,
      stageName: jurisdiction.stages[stage].name,
      previousStageName,
      sourceLink,
      propertyCount: countByOrg.get(orgId) ?? 0,
      affected: summary.affected,
    });

    await supabase.from("compliance_events").insert({
      org_id: orgId,
      type: "stage_confirmed",
      summary: digest.subject,
      details: {
        jurisdiction: jurisdiction.id,
        stage,
        previousStageName,
        sourceLink,
        needsPersonCount: digest.needsPersonCount,
      },
    });

    const { data: alert } = await supabase
      .from("alerts")
      .insert({
        org_id: orgId,
        type: "stage_change",
        severity: digest.severity,
        message: digest.subject,
        // The digest composed its own wording; dispatch uses these
        // rather than appending steps to a one-line message.
        details: { emailBody: digest.body, subject: digest.subject },
      })
      .select("id, org_id, property_id, type, message, details")
      .single();

    if (alert) {
      await dispatchAlertNotifications(supabase, {
        ...alert,
        subject: digest.subject,
      });
      notified += 1;
    }
  }

  return {
    orgsChecked: toProcess.length,
    deferred: Math.max(0, orgIds.length - toProcess.length),
    notified,
    ownSummary,
  };
}
