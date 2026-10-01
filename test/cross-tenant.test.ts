import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb } from "./fake-db";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";
import { DEMO_INITIAL_PROGRAMS } from "@/lib/controllers/demo";
import { isUuid, ownsController, ownsProperty } from "@/lib/security/ownership";

/**
 * Cross-tenant isolation.
 *
 * The hole these cover: row-level security checked that a new row's OWN
 * org_id was the caller's, and never that the property_id beside it
 * belonged to the same organization. Five actions inserted a
 * request-supplied property_id without looking, so any signed-in user
 * could write a row of their own pointing at a stranger's property --
 * and the service-role nightly job, filtering on property_id alone,
 * would act on it.
 *
 * The durable fix is in the database (migration 0029, composite foreign
 * keys). These tests cover the two application layers, which is what the
 * fake can see: the ownership check that refuses, and the org-scoped read
 * that would not act even if a bad row existed.
 */

const VICTIM = "org-victim";
const ATTACKER = "org-attacker";

function twoTenants() {
  return fakeDb({
    organizations: [
      { id: VICTIM, name: "Victim Management" },
      { id: ATTACKER, name: "Attacker LLC" },
    ],
    profiles: [{ id: "user-1", org_id: ATTACKER, email: "a@example.com", phone: null }],
    properties: [
      {
        id: "prop-victim",
        org_id: VICTIM,
        name: "Victim Terrace",
        street_number: "2108",
        street_name: "Barton Springs Rd",
        jurisdiction: "austin",
        property_class: "commercial",
        irrigation_type: "automatic",
        no_street_address: false,
        archived_at: null,
        assigned_to: null,
      },
    ],
    drought_stage_status: [{ jurisdiction: "austin", current_stage: 0 }],
    controllers: [
      {
        id: "ctrl-victim",
        org_id: VICTIM,
        property_id: "prop-victim",
        vendor: "demo",
        vendor_device_id: "demo-1",
        name: "Victim turf",
        demo_state: { programs: DEMO_INITIAL_PROGRAMS },
        compliance_status: null,
        compliance_detail: null,
        meter_street_number: null,
        meter_no_street_address: false,
        meter_label: null,
      },
    ],
    cached_schedules: [],
    compliance_events: [],
    alerts: [],
    work_orders: [],
    vendors: [],
    property_variances: [],
    notification_log: [],
  });
}

describe("a forged variance from another organization", () => {
  it("is not applied to the victim's property", async () => {
    const db = twoTenants();

    // The row an attacker used to be able to insert: their own org_id,
    // the victim's property_id. It permits exactly what the demo
    // controller does, so if it were honoured the victim's violation
    // would disappear.
    db.tables.property_variances.push({
      id: "forged",
      org_id: ATTACKER,
      property_id: "prop-victim",
      kind: "large_property",
      reference: "FORGED-1",
      approved_on: "2026-01-01",
      expires_on: "2099-01-01",
      allowed_days: ["MON", "WED", "FRI", "SAT"],
      allowed_windows: [{ start: "05:00", end: "11:00" }],
      approved_at_stage: 0,
      notes: null,
    });

    const summary = await runComplianceForOrg(
      db as unknown as SupabaseClient,
      VICTIM
    );

    // The violation is still found and corrected. Had the forged variance
    // been read, this would be compliant-and-untouched instead.
    expect(summary.corrected).toBe(1);
    const controller = db.rows("controllers")[0];
    expect(
      (controller.compliance_detail as { rules?: { variance?: string | null } })
        .rules?.variance ?? null
    ).toBeNull();
  });

  it("still honours the victim's own variance", async () => {
    // The scoping must not break the feature it is protecting.
    const db = twoTenants();
    db.tables.property_variances.push({
      id: "genuine",
      org_id: VICTIM,
      property_id: "prop-victim",
      kind: "large_property",
      reference: "AW-REAL-1",
      approved_on: "2026-01-01",
      expires_on: "2099-01-01",
      allowed_days: ["MON", "WED", "FRI", "SAT"],
      allowed_windows: [{ start: "05:00", end: "11:00" }],
      approved_at_stage: 0,
      notes: null,
    });

    const summary = await runComplianceForOrg(
      db as unknown as SupabaseClient,
      VICTIM
    );
    expect(summary.compliant).toBe(1);
    expect(summary.corrected).toBe(0);
  });
});

describe("the ownership check", () => {
  // The helpers must be given an RLS-scoped client: the whole mechanism
  // is that a row belonging to someone else reads as absent. The fake has
  // no RLS, so an absent row is modelled directly.
  it("accepts a property the caller can read", async () => {
    const db = fakeDb({ properties: [{ id: "prop-1", org_id: "org-1" }] });
    expect(await ownsProperty(db as unknown as SupabaseClient, "prop-1")).toBe(true);
  });

  it("refuses a property the caller cannot read", async () => {
    const db = fakeDb({ properties: [] });
    expect(await ownsProperty(db as unknown as SupabaseClient, "prop-victim")).toBe(
      false
    );
  });

  it("refuses an empty id without querying anything", async () => {
    const db = fakeDb({ properties: [{ id: "prop-1", org_id: "org-1" }] });
    expect(await ownsProperty(db as unknown as SupabaseClient, "")).toBe(false);
  });

  it("works the same for controllers", async () => {
    const db = fakeDb({ controllers: [{ id: "ctrl-1", org_id: "org-1" }] });
    expect(await ownsController(db as unknown as SupabaseClient, "ctrl-1")).toBe(true);
    expect(await ownsController(db as unknown as SupabaseClient, "ctrl-x")).toBe(false);
  });
});

describe("ids used in a redirect path", () => {
  it("accepts a real uuid", () => {
    expect(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
  });

  it.each([
    "../..//example.com",
    "/etc/passwd",
    "3f2504e0-4f89-11d3-9a0c-0305e82c3301/../..",
    "",
    "not-a-uuid",
  ])("refuses %o", (value) => {
    // Not a data leak -- a phishing primitive, and cheap to close.
    expect(isUuid(value)).toBe(false);
  });
});
