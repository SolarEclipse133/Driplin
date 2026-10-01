/**
 * The compliance runner: for every controller in an org, sync the
 * schedule, evaluate it against the CONFIRMED stage, auto-correct
 * through the abstraction layer where the vendor allows it, and fall
 * back to manual-fix instructions (plus an alert) where it doesn't.
 *
 * Runs with whatever Supabase client it's given: a signed-in user's
 * client (org-scoped by RLS) or the service-role client from the
 * nightly cron, which loops over all orgs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getController } from "@/lib/controllers/factory";
import {
  ControllerVendor,
  ScheduleProgram,
  ScheduleWriteNotSupportedError,
} from "@/lib/controllers/types";
import { syncControllerById } from "@/lib/controllers/sync";
import { dispatchAlertNotifications } from "@/lib/notifications/dispatch";
import { meterFor } from "./meter";
import { getVendorApiKey } from "@/lib/controllers/credentials";
import { saveEnteredSchedule } from "@/lib/controllers/manual";
import {
  DEFAULT_PROFILE,
  type IrrigationType,
  type PropertyClass,
  type PropertyProfile,
} from "@/lib/jurisdictions";

/**
 * Which published watering table applies to this property. Rows written
 * before the class/type columns existed fall back to Driplin's own
 * default: a commercial account on an automatic system.
 */
function profileOf(
  property: {
    property_class?: string | null;
    irrigation_type?: string | null;
  },
  meter: { noStreetAddress: boolean }
): PropertyProfile {
  return {
    propertyClass:
      (property.property_class as PropertyClass) ??
      DEFAULT_PROFILE.propertyClass,
    irrigationType:
      (property.irrigation_type as IrrigationType) ??
      DEFAULT_PROFILE.irrigationType,
    // Whether there is an address is decided by the meter this
    // controller is on, which may differ from the property's own.
    noStreetAddress: meter.noStreetAddress,
  };
}
import { DroughtStage, getJurisdiction } from "@/lib/jurisdictions";
import { evaluateCompliance } from "./compliance";
import { varianceStatus, type Variance, type VarianceKind } from "./variance";
import { decideChase } from "./work-order-chase";
import {
  describeStaleness,
  scheduleFreshness,
} from "@/lib/controllers/freshness";
import { estimateWeeklySavings } from "./savings";

/**
 * Tell someone a variance is about to lapse, or has become doubtful.
 *
 * Deliberately not every night. An alert that repeats for two weeks is
 * one people filter, and this product's only real asset is that its
 * alerts still get read. So it fires once, is re-raised only if it has
 * not been acknowledged and a week has passed, and says exactly what
 * will happen and when.
 */
async function raiseVarianceWarning(
  supabase: SupabaseClient,
  orgId: string,
  property: { id: string; name: string },
  vstatus: ReturnType<typeof varianceStatus>,
  utility: string
): Promise<void> {
  const active = vstatus.active;
  if (!active) return;

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from("alerts")
    .select("id")
    .eq("property_id", property.id)
    .eq("type", "variance_expiring")
    .gte("created_at", weekAgo)
    .limit(1)
    .maybeSingle();
  if (recent) return;

  const days = vstatus.daysUntilExpiry ?? 0;
  const expiry =
    days === 0
      ? "expires today"
      : `expires in ${days} day${days === 1 ? "" : "s"} (${active.expiresOn.slice(0, 10)})`;

  const message = vstatus.stageAdvanced
    ? `${property.name}: the drought stage has tightened since variance ${active.reference} was approved. ${utility} restricts which variances stay valid at stricter stages, so confirm it still applies. It ${expiry}.`
    : `${property.name}: variance ${active.reference} ${expiry}. After that this property is held to ${utility}'s standard schedule again — renew it or change the controller before then.`;

  await supabase.from("compliance_events").insert({
    org_id: orgId,
    property_id: property.id,
    type: "variance_expiring",
    summary: message,
    details: {
      reference: active.reference,
      expiresOn: active.expiresOn,
      daysUntilExpiry: days,
      stageAdvanced: vstatus.stageAdvanced,
    },
  });

  const { data: alert } = await supabase
    .from("alerts")
    .insert({
      org_id: orgId,
      property_id: property.id,
      type: "variance_expiring",
      // Doubtful beats merely soon: if the stage moved, the property may
      // already be watering without cover.
      severity: vstatus.stageAdvanced ? "critical" : "warning",
      message,
      details: { reference: active.reference, expiresOn: active.expiresOn },
    })
    .select("id, org_id, property_id, type, message, details")
    .single();
  if (alert) await dispatchAlertNotifications(supabase, alert);
}

/**
 * Tell someone Driplin has lost sight of a controller.
 *
 * Losing access is the customer's to fix -- a rotated key, a revoked
 * authorisation -- so it has to reach them, not sit in a status column.
 * Once a week while it lasts: it is a standing condition rather than an
 * event, and a nightly repeat of the same sentence is how people learn
 * to filter Driplin's mail.
 */
async function raiseUnreadableAlert(
  supabase: SupabaseClient,
  orgId: string,
  property: { id: string; name: string },
  controller: { id: string; name: string },
  explanation: string,
  reason: "never_read" | "stale"
): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from("alerts")
    .select("id, details")
    .eq("property_id", property.id)
    .eq("type", "controller_unreadable")
    .gte("created_at", weekAgo);

  const already = (recent ?? []).some(
    (a) =>
      (a.details as { controllerId?: string } | null)?.controllerId ===
      controller.id
  );
  if (already) return;

  const message = `${property.name}: ${explanation} Driplin is not checking ${controller.name} until it can read it again.`;

  await supabase.from("compliance_events").insert({
    org_id: orgId,
    property_id: property.id,
    controller_id: controller.id,
    type: "controller_unreadable",
    summary: message,
    details: { controllerId: controller.id, reason },
  });

  const { data: alert } = await supabase
    .from("alerts")
    .insert({
      org_id: orgId,
      property_id: property.id,
      type: "controller_unreadable",
      // A property nobody is checking is as serious as one in breach:
      // in both cases the compliance Driplin promised is not happening.
      severity: "critical",
      message,
      details: { controllerId: controller.id, reason },
    })
    .select("id, org_id, property_id, type, message, details")
    .single();
  if (alert) await dispatchAlertNotifications(supabase, alert);
}

/** A property_variances row as the rules engine wants it. */
function toVariance(row: Record<string, unknown>): Variance {
  return {
    id: String(row.id),
    kind: row.kind as VarianceKind,
    reference: String(row.reference ?? ""),
    approvedOn: String(row.approved_on ?? ""),
    expiresOn: String(row.expires_on ?? ""),
    allowedDays:
      row.allowed_days === null || row.allowed_days === undefined
        ? "ALL"
        : (row.allowed_days as Variance["allowedDays"]),
    allowedWindows: (row.allowed_windows as Variance["allowedWindows"]) ?? [],
    approvedAtStage: Number(row.approved_at_stage ?? 0) as Variance["approvedAtStage"],
    notes: (row.notes as string | null) ?? null,
  };
}

export interface OrgComplianceSummary {
  checked: number;
  compliant: number;
  corrected: number;
  needsManualFix: number;
  /** Controllers in cities whose published schedule we can't confirm. */
  uncertified: number;
  /** Work orders chased because nobody acted on them. */
  chased: number;
  /** Controllers Driplin could not read, so made no claim about. */
  unreadable: number;
  errors: string[];
}

export async function runComplianceForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgComplianceSummary> {
  const summary: OrgComplianceSummary = {
    checked: 0,
    compliant: 0,
    corrected: 0,
    needsManualFix: 0,
    uncertified: 0,
    chased: 0,
    unreadable: 0,
    errors: [],
  };

  // Confirmed stage per city — a portfolio can span jurisdictions.
  const { data: stageRows } = await supabase
    .from("drought_stage_status")
    .select("jurisdiction, current_stage");
  const stageByJurisdiction = new Map<string, DroughtStage>(
    (stageRows ?? []).map((r) => [
      r.jurisdiction as string,
      (r.current_stage ?? 0) as DroughtStage,
    ])
  );

  const { data: controllers, error } = await supabase
    .from("controllers")
    .select(
      "id, org_id, property_id, vendor, vendor_device_id, name, meter_street_number, meter_no_street_address, meter_label, properties(id, name, street_number, street_name, jurisdiction, property_class, irrigation_type, no_street_address, archived_at)"
    )
    .eq("org_id", orgId);
  if (error) {
    summary.errors.push("Could not list controllers.");
    return summary;
  }

  // A property with four controllers must not produce four identical
  // variance alerts.
  const variancesWarned = new Set<string>();

  for (const c of controllers ?? []) {
    const property = Array.isArray(c.properties) ? c.properties[0] : c.properties;
    if (!property) continue;

    // An archived property has left the portfolio: not monitored, not
    // billed, not counted as checked. Its record stays intact, but
    // Driplin makes no claim about a property it no longer watches.
    if (property.archived_at) continue;

    summary.checked += 1;

    // 1. Refresh our cached copy of the schedule. A failed sync still
    //    lets us evaluate last night's copy -- one flaky request should
    //    not blank a dashboard -- but only for as long as that copy can
    //    still be believed. See step 1b.
    const sync = await syncControllerById(supabase, c.id);

    const { data: cached } = await supabase
      .from("cached_schedules")
      .select("schedule, fetched_at")
      .eq("controller_id", c.id)
      .single();
    const programs: ScheduleProgram[] =
      (cached?.schedule as { programs?: ScheduleProgram[] } | null)?.programs ?? [];

    // 1b. Is the cache still worth judging?
    //
    // A manual controller is exempt: there is nothing to read, so its
    // entered schedule is as current as it will ever be and never goes
    // stale. For everything else, a cache older than the shelf life
    // means Driplin has lost contact -- a rotated key, revoked access, a
    // controller off the network -- and must stop claiming to know
    // anything, rather than reporting the last thing it happened to see.
    const freshness =
      c.vendor === "manual"
        ? ({ usable: true, ageHours: null } as const)
        : scheduleFreshness((cached?.fetched_at as string | null) ?? null);

    if (!freshness.usable) {
      summary.unreadable += 1;
      const vendorLabel = c.vendor as string;
      const explanation = describeStaleness(freshness, vendorLabel);

      await supabase
        .from("controllers")
        .update({
          // Never "compliant" from a cache Driplin no longer trusts.
          compliance_status: "unknown",
          compliance_detail: {
            unreadable: true,
            reason: freshness.reason,
            lastReadAt: (cached?.fetched_at as string | null) ?? null,
            syncError: sync.ok ? null : sync.error,
            manualInstructions: [explanation],
          },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);

      await raiseUnreadableAlert(
        supabase,
        c.org_id,
        property as { id: string; name: string },
        c as { id: string; name: string },
        explanation,
        freshness.reason
      );
      continue;
    }

    // Which meter is this controller on? Its own, if it declares one;
    // otherwise the property's.
    const meter = meterFor(property, c);
    if (meter.digit === null) {
      summary.errors.push(
        `${property.name} (${c.name}): invalid street number on ${meter.source === "controller" ? "this controller's meter" : "the property"}.`
      );
      continue;
    }
    const digit = meter.digit;

    // 2. Evaluate against the confirmed stage for THIS property's city.
    const jurisdictionId = property.jurisdiction ?? "austin";
    const stage = stageByJurisdiction.get(jurisdictionId) ?? 0;
    // Any approved variance on this property. A Large Property
    // variance is common for exactly Driplin's customers -- an HOA
    // common area that cannot be fully watered inside the city's
    // window -- and without this the property would be flagged every
    // night while watering entirely legally.
    const { data: varianceRows } = await supabase
      .from("property_variances")
      .select(
        "id, kind, reference, approved_on, expires_on, allowed_days, allowed_windows, approved_at_stage, notes"
      )
      .eq("property_id", property.id);
    const variances = (varianceRows ?? []).map(toVariance);
    const vstatus = varianceStatus(variances, stage as DroughtStage);

    const result = evaluateCompliance(
      programs,
      digit,
      stage,
      jurisdictionId,
      profileOf(property, meter),
      vstatus.active
    );

    // A lapsing or newly-doubtful variance is worth telling someone
    // about, once, while there is still time to renew it. The day after
    // it expires this property is judged on the city's standard
    // schedule again -- and if its controller was set to the variance
    // schedule, it waters illegally from that morning.
    if (
      vstatus.active &&
      (vstatus.expiringSoon || vstatus.stageAdvanced) &&
      !variancesWarned.has(property.id)
    ) {
      variancesWarned.add(property.id);
      await raiseVarianceWarning(
        supabase,
        c.org_id,
        property,
        vstatus,
        getJurisdiction(jurisdictionId).utility
      );
    }

    // Cities whose published schedule we haven't been able to confirm:
    // report honestly instead of judging against a guess.
    if (!result.certified) {
      summary.uncertified += 1;
      await supabase
        .from("controllers")
        .update({
          compliance_status: "unknown",
          compliance_detail: {
            rules: result.rulesSnapshot,
            uncertified: true,
            manualInstructions: result.manualInstructions,
            officialUrl: result.officialUrl,
          },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      await supabase.from("compliance_events").insert({
        org_id: c.org_id,
        property_id: property.id,
        controller_id: c.id,
        type: "check",
        summary: `${result.rulesSnapshot.jurisdictionName}'s published watering schedule is not yet confirmed in Driplin, so this controller was not evaluated.`,
        details: {
          rules: result.rulesSnapshot,
          officialUrl: result.officialUrl,
        },
      });
      continue;
    }

    await supabase.from("compliance_events").insert({
      org_id: c.org_id,
      property_id: property.id,
      controller_id: c.id,
      type: "check",
      summary: result.compliant
        ? `Compliant with ${result.rulesSnapshot.stageName} rules.`
        : `${result.findings.length} program(s) violate ${result.rulesSnapshot.stageName} rules.`,
      details: { findings: result.findings, rules: result.rulesSnapshot },
    });

    if (result.compliant) {
      summary.compliant += 1;
      await supabase
        .from("controllers")
        .update({
          compliance_status: "compliant",
          compliance_detail: { rules: result.rulesSnapshot },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      continue;
    }

    // 3. Violation: log it, then try to push the corrected schedule.
    await supabase.from("compliance_events").insert({
      org_id: c.org_id,
      property_id: property.id,
      controller_id: c.id,
      type: "violation",
      summary: `Violation at ${property.name}: ${result.findings
        .map((f) => f.programName)
        .join(", ")}.`,
      details: { findings: result.findings, rules: result.rulesSnapshot },
    });

    // Vendor API key for the push (demo needs none).
    let apiKey: string | undefined;
    if (c.vendor !== "demo") {
      apiKey =
        (await getVendorApiKey(supabase, c.org_id, c.vendor)) ?? undefined;
    }

    try {
      // Safety rule: never push a schedule derived from rules we have
      // not verified against the city's published ordinance. Flag it
      // for a human instead — a wrong schedule is worse than none.
      if (!result.rulesVerified) {
        throw new ScheduleWriteNotSupportedError(
          c.vendor as ControllerVendor,
          `Driplin has not verified ${getJurisdiction(jurisdictionId).utility}'s published rules for ${result.rulesSnapshot.stageName}, so it will not change this schedule automatically`
        );
      }

      // Second safety rule: a variance permits MORE than the city's
      // default, and that permission is a customer assertion Driplin
      // has not checked with the utility. Writing a wider schedule onto
      // real hardware on that basis would make Driplin the cause of a
      // violation if the approval does not say what was entered.
      if (!result.safeToPush) {
        throw new ScheduleWriteNotSupportedError(
          c.vendor as ControllerVendor,
          `This property waters under ${vstatus.active ? vstatus.active.reference : "an approved variance"}, which Driplin has not verified with ${getJurisdiction(jurisdictionId).utility}, so it will not widen this schedule automatically`
        );
      }

      const impl = getController(
        {
          id: c.id,
          vendor: c.vendor as ControllerVendor,
          vendor_device_id: c.vendor_device_id,
          name: c.name,
        },
        { apiKey, supabase }
      );
      await impl.setSchedule(result.correctedPrograms);
      // Push succeeded: re-sync the cache and record the correction.
      await syncControllerById(supabase, c.id);
      summary.corrected += 1;
      await supabase
        .from("controllers")
        .update({
          compliance_status: "compliant",
          compliance_detail: {
            rules: result.rulesSnapshot,
            corrected: true,
            findings: result.findings,
          },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      const savings = estimateWeeklySavings(programs, result.correctedPrograms);
      await supabase.from("compliance_events").insert({
        org_id: c.org_id,
        property_id: property.id,
        controller_id: c.id,
        type: "auto_correction",
        summary: `Pushed corrected schedule to ${c.name} at ${property.name}.`,
        details: {
          correctedPrograms: result.correctedPrograms,
          rules: result.rulesSnapshot,
          estimatedWeeklyMinutesSaved: savings.minutesSaved,
          estimatedWeeklyGallonsSaved: savings.gallonsSaved,
        },
      });
      const { data: correctionAlert } = await supabase
        .from("alerts")
        .insert({
          org_id: c.org_id,
          property_id: property.id,
          type: "violation",
          severity: "info",
          message: `${property.name}: schedule was out of compliance and has been corrected automatically.`,
          details: { findings: result.findings },
        })
        .select("id, org_id, property_id, type, message, details")
        .single();
      if (correctionAlert)
        await dispatchAlertNotifications(supabase, correctionAlert);
    } catch (err) {
      // 4. Push failed or unsupported → manual-fallback mode.
      summary.needsManualFix += 1;
      const reason =
        err instanceof ScheduleWriteNotSupportedError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error pushing the corrected schedule.";
      await supabase
        .from("controllers")
        .update({
          compliance_status: "needs_manual_fix",
          compliance_detail: {
            rules: result.rulesSnapshot,
            findings: result.findings,
            manualInstructions: result.manualInstructions,
            reason,
          },
          compliance_checked_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      await supabase.from("compliance_events").insert({
        org_id: c.org_id,
        property_id: property.id,
        controller_id: c.id,
        type: "push_failed",
        summary: `Could not push corrected schedule to ${c.name} at ${property.name}; manual fix required.`,
        details: { reason, manualInstructions: result.manualInstructions },
      });
      const { data: manualAlert } = await supabase
        .from("alerts")
        .insert({
          org_id: c.org_id,
          property_id: property.id,
          type: "push_failed",
          severity: "critical",
          message: `${property.name} is out of compliance and needs a manual schedule change (${c.name}).`,
          details: { manualInstructions: result.manualInstructions, reason },
        })
        .select("id, org_id, property_id, type, message, details")
        .single();
      if (manualAlert) await dispatchAlertNotifications(supabase, manualAlert);
    }
  }

  // Work handed to a vendor that nobody did. Driplin found the problem,
  // sent it on, and until now quietly hoped.
  summary.chased = await chaseStaleWorkOrders(supabase, orgId);

  return summary;
}

/**
 * Chase open work orders on properties that are still in breach.
 *
 * Runs once per organization after the controller sweep, so the
 * compliance statuses it reads are the ones just written.
 */
async function chaseStaleWorkOrders(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const { data: orders } = await supabase
    .from("work_orders")
    .select(
      "id, property_id, created_at, expires_at, properties(name, archived_at), vendors(name), controllers(compliance_status)"
    )
    .eq("org_id", orgId)
    .eq("status", "open");

  if (!orders || orders.length === 0) return 0;

  // When each order was last chased. Read from the alerts themselves, so
  // there is one record of what the customer has been told rather than a
  // second bookkeeping column that can drift from it.
  const { data: priorChases } = await supabase
    .from("alerts")
    .select("details, created_at")
    .eq("org_id", orgId)
    .eq("type", "work_order_stale")
    .order("created_at", { ascending: false });

  const lastChase = new Map<string, string>();
  for (const a of priorChases ?? []) {
    const id = (a.details as { workOrderId?: string } | null)?.workOrderId;
    // Ordered newest first, so the first one seen per order is the latest.
    if (id && !lastChase.has(id)) lastChase.set(id, a.created_at as string);
  }

  let chased = 0;
  for (const o of orders) {
    const property = Array.isArray(o.properties) ? o.properties[0] : o.properties;
    if (!property) continue;
    // A property that has left the portfolio is not chased about.
    if (property.archived_at) continue;

    const vendor = Array.isArray(o.vendors) ? o.vendors[0] : o.vendors;
    const controller = Array.isArray(o.controllers)
      ? o.controllers[0]
      : o.controllers;
    const status = (controller?.compliance_status as string | null) ?? null;

    const decision = decideChase(
      {
        id: o.id as string,
        propertyName: property.name as string,
        vendorName: (vendor?.name as string | null) ?? null,
        createdAt: o.created_at as string,
        expiresAt: o.expires_at as string,
        // Only a property still in breach is worth chasing about. An
        // unknown status is not a breach -- Driplin does not chase
        // someone over a judgement it could not make.
        stillNonCompliant:
          status === "violation" || status === "needs_manual_fix",
        lastChasedAt: lastChase.get(o.id as string) ?? null,
      },
      Date.now()
    );

    if (!decision.chase) continue;

    await supabase.from("compliance_events").insert({
      org_id: orgId,
      property_id: o.property_id,
      type: "work_order_stale",
      summary: decision.message,
      details: {
        workOrderId: o.id,
        ageDays: decision.ageDays,
        linkExpired: decision.linkExpired,
      },
    });

    const { data: alert } = await supabase
      .from("alerts")
      .insert({
        org_id: orgId,
        property_id: o.property_id,
        type: "work_order_stale",
        severity: decision.severity,
        message: decision.message,
        details: {
          workOrderId: o.id,
          ageDays: decision.ageDays,
          linkExpired: decision.linkExpired,
        },
      })
      .select("id, org_id, property_id, type, message, details")
      .single();
    // Only count it once something actually went out. Reporting a chase
    // that failed to send would be the same kind of quiet lie this
    // feature exists to remove.
    if (alert) {
      await dispatchAlertNotifications(supabase, alert);
      chased += 1;
    }
  }

  return chased;
}

/**
 * Re-read ONE controller and judge it against its city's confirmed
 * stage, updating its stored status.
 *
 * Used when somebody says they have fixed a controller by hand: we go
 * and look rather than taking their word for it. A claim is not proof,
 * and being able to check it is the whole advantage of being connected
 * to the controller in the first place.
 */
export interface SingleControllerCheck {
  ok: boolean;
  /** Null when we could not judge (city rules unconfirmed, bad data). */
  compliant: boolean | null;
  /** What is still wrong, in the manager's words. */
  remainingProblems: string[];
  message: string;
  propertyId?: string;
  propertyName?: string;
  orgId?: string;
}

export async function verifyControllerNow(
  supabase: SupabaseClient,
  controllerId: string,
  /**
   * Is somebody ASSERTING they have just made the change by hand?
   *
   * This distinction only bites on a controller Driplin cannot read,
   * where the stored schedule is whatever a person last said it was.
   * Passing true records the corrected schedule as the new claim --
   * right when a manager or a vendor says "done", and wrong the rest of
   * the time, because it would file a change nobody made.
   *
   * It defaults to false so a new caller gets the honest behaviour
   * without having to know any of this.
   */
  options: { appliedByHand?: boolean } = {}
): Promise<SingleControllerCheck> {
  const { data: c } = await supabase
    .from("controllers")
    .select(
      "id, org_id, vendor, vendor_device_id, name, meter_street_number, meter_no_street_address, meter_label, properties(id, name, street_number, street_name, jurisdiction, property_class, irrigation_type, no_street_address)"
    )
    .eq("id", controllerId)
    .single();
  if (!c) {
    return {
      ok: false,
      compliant: null,
      remainingProblems: [],
      message: "Controller not found.",
    };
  }
  const property = Array.isArray(c.properties) ? c.properties[0] : c.properties;
  if (!property) {
    return {
      ok: false,
      compliant: null,
      remainingProblems: [],
      message: "Controller is not attached to a property.",
    };
  }
  const base = {
    propertyId: property.id as string,
    propertyName: property.name as string,
    orgId: c.org_id as string,
  };

  // Pull the controller's current schedule before judging it.
  const sync = await syncControllerById(supabase, controllerId);

  const { data: cached } = await supabase
    .from("cached_schedules")
    .select("schedule, fetched_at")
    .eq("controller_id", controllerId)
    .single();
  const programs: ScheduleProgram[] =
    (cached?.schedule as { programs?: ScheduleProgram[] } | null)?.programs ?? [];

  // The same shelf life as the nightly sweep. Without this, clicking
  // "I've updated it" on a controller Driplin lost access to weeks ago
  // would read the frozen cache and cheerfully confirm compliance.
  const singleFreshness =
    c.vendor === "manual"
      ? ({ usable: true, ageHours: null } as const)
      : scheduleFreshness((cached?.fetched_at as string | null) ?? null);
  if (!singleFreshness.usable) {
    return {
      ...base,
      ok: false,
      compliant: null,
      remainingProblems: [],
      message: describeStaleness(singleFreshness, c.vendor as string),
    };
  }

  const meter = meterFor(property, c);
  const digit = meter.digit;
  if (digit === null) {
    return {
      ...base,
      ok: false,
      compliant: null,
      remainingProblems: [],
      message:
        meter.source === "controller"
          ? "This controller's meter address is not a valid street number."
          : "This property's street number is not a valid address number.",
    };
  }

  const jurisdictionId = property.jurisdiction ?? "austin";
  const { data: stageRow } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .eq("jurisdiction", jurisdictionId)
    .maybeSingle();
  const stage = (stageRow?.current_stage ?? 0) as DroughtStage;

  // Judge this the same way the nightly sweep does, variance included.
  // If this path ignored the variance, clicking "I've updated it" on a
  // property watering legally under an approval would report a
  // violation the nightly run had just cleared.
  const { data: varianceRows } = await supabase
    .from("property_variances")
    .select(
      "id, kind, reference, approved_on, expires_on, allowed_days, allowed_windows, approved_at_stage, notes"
    )
    .eq("property_id", property.id);
  const vstatus = varianceStatus(
    (varianceRows ?? []).map(toVariance),
    stage
  );

  const result = evaluateCompliance(
    programs,
    digit,
    stage,
    jurisdictionId,
    profileOf(property, meter),
    vstatus.active
  );

  // A controller Driplin cannot read cannot be verified. Record what
  // the person says they set it to, and be explicit that this is their
  // word rather than a checked fact — that distinction is the whole
  // reason anyone trusts the rest of the record.
  if (c.vendor === "manual") {
    // Only record the corrected schedule as the new claim when somebody
    // has actually said they applied it. Doing it on a plain re-check
    // would quietly rewrite their entry to the compliant version and
    // then report the controller as set that way -- a change nobody
    // made, filed as evidence.
    if (options.appliedByHand) {
      await saveEnteredSchedule(supabase, controllerId, result.correctedPrograms);
    }
    await supabase
      .from("controllers")
      .update({
        compliance_status: "unknown",
        compliance_detail: {
          rules: result.rulesSnapshot,
          findings: [],
          manualInstructions: result.manualInstructions,
          uncertified: true,
          unverifiable: true,
          officialUrl: result.officialUrl,
        },
        compliance_checked_at: new Date().toISOString(),
      })
      .eq("id", controllerId);
    return {
      ...base,
      ok: true,
      compliant: null,
      remainingProblems: [],
      message: options.appliedByHand
        ? `Recorded, and the schedule updated to what the ${result.rulesSnapshot.stageName} rules require. Driplin can't read this controller, so this is logged as your word rather than a checked fact.`
        : result.manualInstructions.length > 0
          ? `Driplin can't read this controller, so it has judged the schedule you entered against the ${result.rulesSnapshot.stageName} rules. It needs changing by hand: ${result.manualInstructions.join(" ")}`
          : `Driplin can't read this controller, so it has judged the schedule you entered against the ${result.rulesSnapshot.stageName} rules. Nothing needs changing.`,
    };
  }

  const status = !result.certified
    ? "unknown"
    : result.compliant
      ? "compliant"
      : "needs_manual_fix";

  await supabase
    .from("controllers")
    .update({
      compliance_status: status,
      compliance_detail: {
        rules: result.rulesSnapshot,
        findings: result.findings,
        manualInstructions: result.manualInstructions,
        uncertified: !result.certified,
        officialUrl: result.officialUrl,
      },
      compliance_checked_at: new Date().toISOString(),
    })
    .eq("id", controllerId);

  if (!result.certified) {
    return {
      ...base,
      ok: true,
      compliant: null,
      remainingProblems: [],
      message: `Recorded. Driplin has not confirmed ${result.rulesSnapshot.jurisdictionName}'s published schedule, so it cannot check this controller against it.`,
    };
  }

  if (result.compliant) {
    return {
      ...base,
      ok: true,
      compliant: true,
      remainingProblems: [],
      message: sync.ok
        ? `Verified — ${c.name} now matches the ${result.rulesSnapshot.stageName} rules.`
        : `Recorded. We could not reach ${c.name} just now, but its last known schedule matches the ${result.rulesSnapshot.stageName} rules.`,
    };
  }

  const problems = result.findings.flatMap((f) =>
    f.problems.map((p) => `${f.programName}: ${p}`)
  );
  return {
    ...base,
    ok: true,
    compliant: false,
    remainingProblems: problems,
    message: `Recorded, but ${c.name} still does not match the ${result.rulesSnapshot.stageName} rules.`,
  };
}
