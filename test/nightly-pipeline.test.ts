import { describe, expect, it, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb, type FakeDb, type Row } from "./fake-db";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";
import { DEMO_INITIAL_PROGRAMS } from "@/lib/controllers/demo";

/**
 * The nightly run, end to end.
 *
 * Every bug found in this codebase by hand lived in the WIRING: a shared
 * function whose two callers wanted opposite things, a variance honoured
 * in the nightly sweep but not in the single check, a cached schedule
 * judged long after it could be trusted, an alert type with no subject
 * line. None of that is in a pure module, so no unit test could see it.
 *
 * This drives the real runComplianceForOrg against an in-memory database:
 * sync, cache, evaluate, write a verdict, raise alerts, chase work orders.
 * It does not emulate row-level security or CHECK constraints -- see
 * ./fake-db -- so green here means the parts fit together, not that
 * Postgres would accept every row.
 */

// Austin, commercial, automatic, even street number -> Tuesday only,
// before 10am or after 7pm. Verified in lib/jurisdictions/austin.ts.
const AUSTIN_COMMERCIAL_DAY = "TUE";

const ORG = "org-1";

function seed(over: { controllers?: Row[]; extra?: Record<string, Row[]> } = {}) {
  return fakeDb({
    organizations: [{ id: ORG, name: "Hill Country Management" }],
    profiles: [
      { id: "user-1", org_id: ORG, email: "dana@example.com", phone: null, role: "member" },
    ],
    properties: [
      {
        id: "prop-1",
        org_id: ORG,
        name: "Zilker Terrace",
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
    controllers: over.controllers ?? [
      {
        id: "ctrl-1",
        org_id: ORG,
        property_id: "prop-1",
        vendor: "demo",
        vendor_device_id: "demo-1",
        name: "Front turf",
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
    ...over.extra,
  });
}

const run = (db: FakeDb) =>
  runComplianceForOrg(db as unknown as SupabaseClient, ORG);

const controller = (db: FakeDb, id = "ctrl-1") =>
  db.rows("controllers").find((c) => c.id === id)!;

const alertsOfType = (db: FakeDb, type: string) =>
  db.rows("alerts").filter((a) => a.type === type);

beforeEach(() => {
  // No real email or SMS, and no key needed: the senders log when
  // unconfigured, which is what the test environment is.
  vi.unstubAllEnvs();
});

describe("a controller watering on the wrong day", () => {
  it("is corrected, and the correction is recorded", async () => {
    // The demo controller starts on Mon/Wed/Fri at 10:00, which Austin
    // permits for no commercial even address.
    const db = seed();
    const summary = await run(db);

    expect(summary.checked).toBe(1);
    expect(summary.corrected).toBe(1);
    expect(controller(db).compliance_status).toBe("compliant");

    // The schedule actually written back, not just the verdict.
    const cached = db.rows("cached_schedules")[0].schedule as {
      programs: { days: string[]; startTime: string }[];
    };
    for (const p of cached.programs) {
      if (p.days.length > 0) expect(p.days).toEqual([AUSTIN_COMMERCIAL_DAY]);
    }

    const events = db.rows("compliance_events").map((e) => e.type);
    expect(events).toContain("auto_correction");
  });

  it("tells somebody, exactly once", async () => {
    const db = seed();
    await run(db);
    // One alert, and a notification logged against it.
    expect(alertsOfType(db, "violation")).toHaveLength(1);
    expect(db.rows("notification_log").length).toBeGreaterThan(0);
  });

  it("holds the per-controller alert back in digest mode", async () => {
    // A stage change re-judges a whole city at once. The alert is still
    // RECORDED; only its sending is held, so one digest can go instead.
    const db = seed();
    await runComplianceForOrg(db as unknown as SupabaseClient, ORG, {
      digestAlerts: true,
    });
    expect(alertsOfType(db, "violation")).toHaveLength(1);
    expect(db.rows("notification_log")).toHaveLength(0);
  });
});

describe("a controller already watering legally", () => {
  it("is left alone and nobody is bothered", async () => {
    const db = seed({
      controllers: [
        {
          ...seed().rows("controllers")[0],
          demo_state: {
            programs: [
              {
                vendorProgramId: "p1",
                name: "Front turf",
                enabled: true,
                days: [AUSTIN_COMMERCIAL_DAY],
                startTime: "05:00",
                durationMinutes: 30,
              },
            ],
          },
        },
      ],
    });
    const summary = await run(db);

    expect(summary.compliant).toBe(1);
    expect(summary.corrected).toBe(0);
    expect(controller(db).compliance_status).toBe("compliant");
    expect(db.rows("alerts")).toHaveLength(0);
  });
});

describe("a city whose table Driplin has not confirmed", () => {
  it("judges nothing and changes nothing", async () => {
    // Austin's Stage 3 day assignment is unverified. The product's most
    // important behaviour is the refusal.
    const db = seed();
    db.rows("drought_stage_status")[0].current_stage = 3;

    const summary = await run(db);

    expect(summary.uncertified).toBe(1);
    expect(summary.corrected).toBe(0);
    expect(controller(db).compliance_status).toBe("unknown");
    // Nothing was written to the controller's schedule.
    const cached = db.rows("cached_schedules")[0]?.schedule as
      | { programs: { days: string[] }[] }
      | undefined;
    expect(cached?.programs?.[0]?.days).toEqual(DEMO_INITIAL_PROGRAMS[0].days);
  });
});

describe("an approved variance", () => {
  it("stops a legal property being flagged, and blocks the push", async () => {
    const db = seed({
      extra: {
        property_variances: [
          {
            id: "v1",
            org_id: ORG,
            property_id: "prop-1",
            kind: "large_property",
            reference: "AW-2026-4417",
            approved_on: "2026-01-01",
            expires_on: "2099-01-01",
            // Covers both demo programs: Mon/Wed/Fri 10:00 and Sat 05:30.
            // A Large Property approval looks like this -- a wider window
            // than the city's, because the site cannot be covered inside it.
            allowed_days: ["MON", "WED", "FRI", "SAT"],
            allowed_windows: [{ start: "05:00", end: "11:00" }],
            approved_at_stage: 0,
            notes: null,
          },
        ],
      },
    });

    const summary = await run(db);

    // Both programs fall inside what the approval permits, so compliant
    // even though Austin's own table allows neither day --
    // and Driplin must not push a widened schedule onto real hardware on
    // the strength of a document the customer reported.
    expect(summary.compliant).toBe(1);
    expect(summary.corrected).toBe(0);
    expect(controller(db).compliance_status).toBe("compliant");
    const cached = db.rows("cached_schedules")[0].schedule as {
      programs: { days: string[] }[];
    };
    expect(cached.programs[0].days).toEqual(DEMO_INITIAL_PROGRAMS[0].days);
  });
});

describe("a controller Driplin can no longer read", () => {
  it("is never reported compliant from a stale cache", async () => {
    const db = seed({
      controllers: [
        {
          ...seed().rows("controllers")[0],
          vendor: "rachio",
          // No key stored, so the sync will fail.
        },
      ],
      extra: {
        cached_schedules: [
          {
            id: "cs-1",
            controller_id: "ctrl-1",
            // Compliant, and four days old.
            schedule: {
              programs: [
                {
                  vendorProgramId: "p1",
                  name: "Front turf",
                  enabled: true,
                  days: [AUSTIN_COMMERCIAL_DAY],
                  startTime: "05:00",
                  durationMinutes: 30,
                },
              ],
            },
            fetched_at: new Date(Date.now() - 96 * 3_600_000).toISOString(),
          },
        ],
      },
    });

    const summary = await run(db);

    expect(summary.unreadable).toBe(1);
    expect(summary.compliant).toBe(0);
    // The whole point: not "compliant", despite a compliant cache.
    expect(controller(db).compliance_status).toBe("unknown");
    expect(
      (controller(db).compliance_detail as { unreadable?: boolean }).unreadable
    ).toBe(true);
    expect(alertsOfType(db, "controller_unreadable")).toHaveLength(1);
  });

  it("still judges a fresh cache when a single sync fails", async () => {
    // One flaky request must not blank a dashboard.
    const db = seed({
      controllers: [{ ...seed().rows("controllers")[0], vendor: "rachio" }],
      extra: {
        cached_schedules: [
          {
            id: "cs-1",
            controller_id: "ctrl-1",
            schedule: {
              programs: [
                {
                  vendorProgramId: "p1",
                  name: "Front turf",
                  enabled: true,
                  days: [AUSTIN_COMMERCIAL_DAY],
                  startTime: "05:00",
                  durationMinutes: 30,
                },
              ],
            },
            fetched_at: new Date(Date.now() - 3_600_000).toISOString(),
          },
        ],
      },
    });

    const summary = await run(db);
    expect(summary.unreadable).toBe(0);
    expect(summary.compliant).toBe(1);
  });
});

describe("an archived property", () => {
  it("is not checked, counted, or alerted about", async () => {
    const db = seed();
    db.rows("properties")[0].archived_at = new Date().toISOString();

    const summary = await run(db);

    expect(summary.checked).toBe(0);
    expect(db.rows("alerts")).toHaveLength(0);
    expect(controller(db).compliance_status).toBeNull();
  });
});

describe("a work order nobody acted on", () => {
  it("is chased once the property is still in breach and time has passed", async () => {
    const db = seed({
      controllers: [
        {
          ...seed().rows("controllers")[0],
          vendor: "manual",
          entered_schedule: {
            programs: [
              {
                vendorProgramId: "p1",
                name: "Turf",
                enabled: true,
                days: ["MON"],
                startTime: "10:00",
                durationMinutes: 30,
              },
            ],
          },
        },
      ],
      extra: {
        vendors: [{ id: "v1", org_id: ORG, name: "Hill Country Lawn" }],
        work_orders: [
          {
            id: "wo-1",
            org_id: ORG,
            property_id: "prop-1",
            controller_id: "ctrl-1",
            vendor_id: "v1",
            status: "open",
            created_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
            expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          },
        ],
      },
    });

    // A manual controller cannot be pushed to, so it lands in
    // needs_manual_fix -- which is what makes the order worth chasing.
    const summary = await run(db);

    expect(summary.needsManualFix).toBe(1);
    expect(summary.chased).toBe(1);
    const chase = alertsOfType(db, "work_order_stale")[0];
    expect(chase.severity).toBe("critical");
    expect(String(chase.message)).toContain("Hill Country Lawn");
  });

  it("is not chased when the property is compliant again", async () => {
    const db = seed({
      extra: {
        vendors: [{ id: "v1", org_id: ORG, name: "Hill Country Lawn" }],
        work_orders: [
          {
            id: "wo-1",
            org_id: ORG,
            property_id: "prop-1",
            controller_id: "ctrl-1",
            vendor_id: "v1",
            status: "open",
            created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
            expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          },
        ],
      },
    });

    // The demo controller is corrected automatically, so by the time the
    // chase runs the property complies and there is nothing to chase.
    const summary = await run(db);
    expect(summary.chased).toBe(0);
    expect(alertsOfType(db, "work_order_stale")).toHaveLength(0);
  });
});
