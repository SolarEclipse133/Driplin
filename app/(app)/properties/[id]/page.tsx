import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWateringDigit } from "@/lib/rules/address";
import {
  getJurisdiction,
  resolveSchedule,
  type DroughtStage,
} from "@/lib/jurisdictions";
import { getAccountClient } from "@/lib/controllers/factory";
import { ControllerError, ScheduleProgram, WEEKDAYS } from "@/lib/controllers/types";
import { VendorConnectForm } from "@/components/vendor-connect-form";
import { ManualFixPanel } from "@/components/manual-fix-panel";
import { confirmManualFix } from "./confirm-actions";
import { sendToVendor } from "./work-order-actions";
import { signedPhotoUrl } from "@/lib/photos/store";
import {
  addDemoController,
  connectVendorDevice,
  removeController,
  saveVendorKey,
  syncController,
} from "./controller-actions";

function formatDays(days: ScheduleProgram["days"]): string {
  if (days.length === 0) return "No days set";
  const ordered = WEEKDAYS.filter((d) => days.includes(d));
  return ordered.map((d) => d[0] + d.slice(1).toLowerCase()).join(", ");
}

const VENDOR_LABELS: Record<string, string> = {
  rachio: "Rachio",
  hydrawise: "Hydrawise",
  demo: "Demo",
};

const COMPLIANCE_BADGES: Record<string, { label: string; className: string }> = {
  compliant: { label: "Compliant", className: "bg-green-50 text-green-800" },
  violation: { label: "Violation", className: "bg-red-50 text-red-700" },
  needs_manual_fix: {
    label: "Needs manual fix",
    className: "bg-amber-50 text-amber-800",
  },
  unknown: { label: "Not checked yet", className: "bg-slate-100 text-slate-600" },
};

export default async function PropertyDetailPage({
  params,
}: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  // Default report period: the last 90 days (async server component, so
  // reading the clock here is fine — it runs per request, not per render).
  const reportTo = new Date();
  const reportFrom = new Date(reportTo.getTime() - 90 * 24 * 3600 * 1000);

  const { data: property } = await supabase
    .from("properties")
    .select("id, name, street_number, street_name, city, state, zip, unit_count, jurisdiction, property_class, irrigation_type")
    .eq("id", id)
    .single();
  if (!property) notFound();

  // The stage in force for this property's city, so the header can show
  // the watering days that actually apply to it — which in Austin and
  // Leander depend on the account class, not just the address.
  const { data: stageRow } = await supabase
    .from("drought_stage_status")
    .select("current_stage")
    .eq("jurisdiction", property.jurisdiction ?? "austin")
    .maybeSingle();
  const stageForProperty = (stageRow?.current_stage ?? 0) as DroughtStage;

  const { data: confirmations } = await supabase
    .from("manual_fix_confirmations")
    .select("id, controller_id, confirmed_by_name, confirmed_via, note, verified, created_at, flagged_at, photo_path")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Photos live in a private bucket; hand the browser short-lived
  // signed links rather than making the bucket public.
  const photoUrls = new Map<string, string>();
  for (const f of confirmations ?? []) {
    if (!f.photo_path) continue;
    const url = await signedPhotoUrl(supabase, f.photo_path);
    if (url) photoUrls.set(f.id, url);
  }

  // Vendors who service this property, plus any jobs already out.
  const { data: vendorLinks } = await supabase
    .from("vendor_properties")
    .select("vendors(id, name, email)")
    .eq("property_id", id);
  const propertyVendors = (vendorLinks ?? [])
    .map((l) => (Array.isArray(l.vendors) ? l.vendors[0] : l.vendors))
    .filter((v): v is { id: string; name: string; email: string | null } => !!v);

  const { data: openOrders } = await supabase
    .from("work_orders")
    .select("id, controller_id")
    .eq("property_id", id)
    .eq("status", "open");

  const { data: controllers } = await supabase
    .from("controllers")
    .select(
      "id, vendor, vendor_device_id, name, status, last_seen_at, compliance_status, compliance_detail, compliance_checked_at, cached_schedules(schedule, fetched_at)"
    )
    .eq("property_id", id)
    .order("created_at");

  // For each connectable vendor: does the org have a key, and if so,
  // which of that account's devices aren't connected here yet?
  const CONNECTABLE = [
    {
      vendor: "rachio" as const,
      label: "Rachio",
      keyHint: "Found in app.rach.io → Account Settings → GET API KEY",
    },
    {
      vendor: "hydrawise" as const,
      label: "Hydrawise",
      keyHint:
        "Found in the Hydrawise app → Account Details → Generate API Key",
    },
  ];

  const vendorSections = await Promise.all(
    CONNECTABLE.map(async (v) => {
      const { data: cred } = await supabase
        .from("vendor_credentials")
        .select("api_key")
        .eq("vendor", v.vendor)
        .maybeSingle();

      let devices: { vendorDeviceId: string; name: string }[] | null = null;
      let apiError: string | null = null;
      if (cred?.api_key) {
        try {
          const all = await getAccountClient(v.vendor, cred.api_key).listDevices();
          const connectedIds = new Set(
            (controllers ?? [])
              .filter((c) => c.vendor === v.vendor)
              .map((c) => c.vendor_device_id)
          );
          devices = all.filter((d) => !connectedIds.has(d.vendorDeviceId));
        } catch (err) {
          apiError =
            err instanceof ControllerError
              ? err.message
              : `Could not reach ${v.label} right now.`;
        }
      }
      return { ...v, hasCredential: !!cred?.api_key, devices, apiError };
    })
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{property.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {property.street_number} {property.street_name}, {property.city}{" "}
            {property.zip} · {property.unit_count}{" "}
            {property.unit_count === 1 ? "unit" : "units"} · Watering digit:{" "}
            {getWateringDigit(property.street_number) ?? "?"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {property.property_class === "residential"
              ? "Single-family residential"
              : "Commercial / multifamily"}{" "}
            account ·{" "}
            {property.irrigation_type === "drip_or_hose"
              ? "drip or hose-end"
              : "automatic system"}
            {" — "}
            <span className="text-slate-600">
              {
                resolveSchedule(
                  getJurisdiction(property.jurisdiction).stages[
                    stageForProperty
                  ],
                  {
                    propertyClass:
                      (property.property_class as "residential" | "commercial") ??
                      "commercial",
                    irrigationType:
                      (property.irrigation_type as
                        | "automatic"
                        | "drip_or_hose") ?? "automatic",
                  }
                ).summary
              }
            </span>
          </p>
        </div>
        <Link
          href={`/properties/${property.id}/edit`}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Edit property
        </Link>
      </div>

      {/* Connected controllers */}
      <h2 className="mt-8 text-lg font-semibold">Controllers</h2>
      {(controllers?.length ?? 0) === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          No controllers connected yet. Connect one below so Driplin can
          monitor its watering schedule.
        </p>
      )}

      <div className="mt-3 space-y-4">
        {controllers?.map((c) => {
          const cached = Array.isArray(c.cached_schedules)
            ? c.cached_schedules[0]
            : c.cached_schedules;
          const programs: ScheduleProgram[] =
            (cached?.schedule as { programs?: ScheduleProgram[] } | null)
              ?.programs ?? [];
          return (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <p className="font-medium">{c.name}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {VENDOR_LABELS[c.vendor] ?? c.vendor}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      c.status === "connected"
                        ? "bg-green-50 text-green-800"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {c.status}
                  </span>
                  {(() => {
                    const badge =
                      COMPLIANCE_BADGES[c.compliance_status] ??
                      COMPLIANCE_BADGES.unknown;
                    return (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <form action={syncController}>
                    <input type="hidden" name="controller_id" value={c.id} />
                    <input type="hidden" name="property_id" value={property.id} />
                    <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                      Sync now
                    </button>
                  </form>
                  <form action={removeController}>
                    <input type="hidden" name="controller_id" value={c.id} />
                    <input type="hidden" name="property_id" value={property.id} />
                    <button className="rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                      Disconnect
                    </button>
                  </form>
                </div>
              </div>

              {programs.length > 0 ? (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {programs.map((p) => (
                    <li
                      key={p.vendorProgramId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="font-medium">
                        {p.name}
                        {!p.enabled && (
                          <span className="ml-2 text-xs text-slate-400">
                            (disabled)
                          </span>
                        )}
                      </span>
                      <span className="text-slate-600">
                        {formatDays(p.days)} · starts {p.startTime} ·{" "}
                        {p.durationMinutes} min
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  No watering programs found on this controller.
                </p>
              )}
              {(c.compliance_detail as { uncertified?: boolean } | null)
                ?.uncertified && (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">
                    Driplin hasn&apos;t confirmed this city&apos;s published
                    watering schedule yet, so it is not judging or changing
                    this controller.
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                    {((c.compliance_detail as {
                      manualInstructions?: string[];
                    } | null)?.manualInstructions ?? []).map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              <ManualFixPanel
                action={confirmManualFix}
                controllerId={c.id}
                propertyId={property.id}
                vendorLabel={VENDOR_LABELS[c.vendor] ?? c.vendor}
                needsManualFix={c.compliance_status === "needs_manual_fix"}
                instructions={
                  ((c.compliance_detail as {
                    manualInstructions?: string[];
                  } | null)?.manualInstructions ?? [])
                }
                sendToVendorAction={sendToVendor}
                vendors={propertyVendors}
                openOrderCount={
                  (openOrders ?? []).filter((o) => o.controller_id === c.id)
                    .length
                }
              />

              {(() => {
                const mine = (confirmations ?? []).filter(
                  (f) => f.controller_id === c.id
                );
                if (mine.length === 0) return null;
                return (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Manual fix history
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {mine.map((f) => (
                        <li key={f.id} className="text-sm text-slate-600">
                          <span
                            className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                              f.verified === true
                                ? "bg-green-50 text-green-800"
                                : f.verified === false
                                  ? "bg-red-50 text-red-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {f.verified === true
                              ? "Verified"
                              : f.verified === false
                                ? "Still failing"
                                : "Not checked"}
                          </span>
                          {f.confirmed_by_name}
                          {f.confirmed_via === "vendor" ? " (vendor)" : ""} ·{" "}
                          {new Date(f.created_at).toLocaleString("en-US", {
                            timeZone: "America/Chicago",
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                          {f.note ? ` · “${f.note}”` : ""}
                          {photoUrls.has(f.id) && (
                            <a
                              href={photoUrls.get(f.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoUrls.get(f.id)}
                                alt="Photo of the updated controller"
                                className="h-20 w-20 rounded-md border border-slate-200 object-cover"
                              />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              {cached?.fetched_at && (
                <p className="mt-2 text-xs text-slate-400">
                  Schedule last synced{" "}
                  {new Date(cached.fetched_at).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                  })}{" "}
                  (Central)
                  {c.compliance_checked_at &&
                    ` · compliance checked ${new Date(
                      c.compliance_checked_at
                    ).toLocaleString("en-US", { timeZone: "America/Chicago" })}`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Connect vendor controllers */}
      {vendorSections.map((v) => (
        <div
          key={v.vendor}
          className="mt-8 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h3 className="font-semibold">Connect a {v.label} controller</h3>
          {!v.hasCredential && (
            <VendorConnectForm
              action={saveVendorKey.bind(null, v.vendor, property.id)}
              vendorLabel={v.label}
              keyHint={v.keyHint}
            />
          )}
          {v.hasCredential && v.apiError && (
            <p
              role="alert"
              className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {v.apiError}
            </p>
          )}
          {v.hasCredential && !v.apiError && (v.devices?.length ?? 0) === 0 && (
            <p className="mt-3 text-sm text-slate-500">
              Your {v.label} account is connected, but no (further)
              controllers were found on it. Devices appear here as soon as
              they are added to the {v.label} account.
            </p>
          )}
          {v.hasCredential && (v.devices?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-2">
              {v.devices!.map((d) => (
                <li
                  key={d.vendorDeviceId}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                >
                  <span className="text-sm font-medium">{d.name}</span>
                  <form
                    action={connectVendorDevice.bind(
                      null,
                      v.vendor,
                      property.id
                    )}
                  >
                    <input
                      type="hidden"
                      name="device_id"
                      value={d.vendorDeviceId}
                    />
                    <input type="hidden" name="device_name" value={d.name} />
                    <button className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800">
                      Connect
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {/* Board report */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Board report</h3>
        <p className="mt-1 text-sm text-slate-500">
          A one-page PDF summarizing compliance activity and estimated water
          savings — ready to hand to the HOA board.
        </p>
        <form
          action={`/api/reports/${property.id}`}
          method="GET"
          target="_blank"
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div>
            <label htmlFor="from" className="block text-xs font-medium text-slate-600">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={reportFrom.toISOString().slice(0, 10)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="to" className="block text-xs font-medium text-slate-600">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={reportTo.toISOString().slice(0, 10)}
              className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">
            Download PDF report
          </button>
        </form>
      </div>

      {/* Demo controller */}
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Demo controller</h3>
            <p className="mt-1 text-sm text-slate-500">
              A simulated controller for trying out Driplin without
              hardware. Behaves like a real one, including schedule
              corrections.
            </p>
          </div>
          <form action={addDemoController.bind(null, property.id)}>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Add demo controller
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
