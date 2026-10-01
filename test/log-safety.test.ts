import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb } from "./fake-db";
import { runComplianceForOrg } from "@/lib/rules/run-compliance";

/**
 * What actually reaches the log when the real pipeline fails.
 *
 * The unit tests prove redact() strips a credential it is handed. This
 * proves the call sites hand it the right things in the first place --
 * which is the half that a careful regex cannot guarantee.
 */

afterEach(() => vi.restoreAllMocks());

const ORG = "org-1";

function withFailingVendor() {
  return fakeDb({
    organizations: [{ id: ORG, name: "Hill Country Management" }],
    profiles: [{ id: "u1", org_id: ORG, email: "dana@example.com", phone: null }],
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
    controllers: [
      {
        id: "ctrl-1",
        org_id: ORG,
        property_id: "prop-1",
        // A real vendor with no stored credential: the sync will fail.
        vendor: "rachio",
        vendor_device_id: "dev-1",
        name: "Front turf",
        compliance_status: null,
        compliance_detail: null,
        meter_street_number: null,
        meter_no_street_address: false,
        meter_label: null,
      },
    ],
    vendor_credentials: [
      {
        id: "vc-1",
        org_id: ORG,
        vendor: "rachio",
        // Driplin's encrypted-credential envelope.
        api_key: "v1.aXZpdg.dGFnZ2Vk.Y2lwaGVydGV4dA",
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

describe("a real failure in the nightly run", () => {
  it("does not take the whole run down with it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = withFailingVendor();

    // This used to throw: getVendorApiKey sat outside syncControllerById's
    // try block, so one unreadable credential ended the nightly run for
    // every organization.
    const summary = await runComplianceForOrg(
      db as unknown as SupabaseClient,
      ORG
    );
    expect(summary.checked).toBe(1);
  });

  it("writes something an engineer can act on", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = withFailingVendor();

    await runComplianceForOrg(db as unknown as SupabaseClient, ORG);

    const lines = spy.mock.calls.map((c) => String(c[0]));
    const reported = lines.find((l) =>
      l.includes("controller.credential_unreadable")
    );
    expect(reported, "expected the failure to be reported").toBeDefined();

    const entry = JSON.parse(reported!);
    // The identifiers needed to find the controller, and nothing more.
    expect(entry.context.controllerId).toBe("ctrl-1");
    expect(entry.context.vendor).toBe("rachio");
  });

  it("leaks no credential, token or address into any line", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = withFailingVendor();

    await runComplianceForOrg(db as unknown as SupabaseClient, ORG);

    const everything = [...spy.mock.calls, ...warn.mock.calls]
      .map((c) => String(c[0]))
      .join("\n");

    // The stored credential, in either form.
    expect(everything).not.toContain("v1.aXZpdg");
    expect(everything).not.toContain("Y2lwaGVydGV4dA");
    // A customer's street address has no business in a log.
    expect(everything).not.toContain("Barton Springs");
    expect(everything).not.toContain("2108");
    // And an unmasked email address.
    expect(everything).not.toContain("dana@example.com");
  });
});
