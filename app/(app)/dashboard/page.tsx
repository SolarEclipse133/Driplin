import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StageBanner } from "@/components/stage-banner";
import { RecheckButton } from "@/components/recheck-button";
import { recheckCompliance } from "./actions";

/**
 * Portfolio dashboard: summary metric cards, per-property compliance
 * list, and a recent-alerts feed — with the stage-verification banner
 * on top so the active restrictions are always auditable.
 */

type PropertyRollup = "compliant" | "violation" | "needs_manual_fix" | "unknown";

const ROLLUP_BADGES: Record<PropertyRollup, { label: string; className: string }> = {
  compliant: { label: "Compliant", className: "bg-green-50 text-green-800" },
  violation: { label: "Violation", className: "bg-red-50 text-red-700" },
  needs_manual_fix: {
    label: "Needs manual fix",
    className: "bg-amber-50 text-amber-800",
  },
  unknown: { label: "Not checked", className: "bg-slate-100 text-slate-600" },
};

const SEVERITY_DOTS: Record<string, string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  critical: "bg-red-600",
};

function rollupFor(statuses: string[]): PropertyRollup {
  if (statuses.length === 0) return "unknown";
  if (statuses.includes("needs_manual_fix")) return "needs_manual_fix";
  if (statuses.includes("violation")) return "violation";
  if (statuses.every((s) => s === "compliant")) return "compliant";
  return "unknown";
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select(
      "id, name, unit_count, street_number, street_name, controllers(id, name, vendor, compliance_status)"
    )
    .order("name");

  const { data: openAlerts } = await supabase
    .from("alerts")
    .select("id")
    .eq("acknowledged", false)
    .not("org_id", "is", null);

  const { data: recentAlerts } = await supabase
    .from("alerts")
    .select("id, message, severity, acknowledged, created_at")
    .not("org_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: corrections } = await supabase
    .from("compliance_events")
    .select("details")
    .eq("type", "auto_correction");

  const gallonsPerWeek = (corrections ?? []).reduce((sum, e) => {
    const g = (e.details as { estimatedWeeklyGallonsSaved?: number } | null)
      ?.estimatedWeeklyGallonsSaved;
    return sum + (typeof g === "number" ? g : 0);
  }, 0);

  const rows = (properties ?? []).map((p) => {
    const controllers = Array.isArray(p.controllers) ? p.controllers : [];
    return {
      ...p,
      controllers,
      rollup: rollupFor(controllers.map((c) => c.compliance_status)),
    };
  });
  const compliantCount = rows.filter((r) => r.rollup === "compliant").length;

  return (
    <div>
      <StageBanner />

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Properties" value={String(rows.length)} />
        <MetricCard
          label="Compliant"
          value={`${compliantCount}/${rows.length}`}
          hint="properties fully compliant"
        />
        <MetricCard
          label="Est. water saved"
          value={gallonsPerWeek.toLocaleString()}
          hint="gallons/week from schedule corrections"
        />
        <MetricCard
          label="Open alerts"
          value={String(openAlerts?.length ?? 0)}
          hint="unacknowledged"
        />
      </div>

      <div className="mt-4">
        <RecheckButton action={recheckCompliance} />
      </div>

      {/* Property list */}
      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Properties</h2>
        <Link
          href="/properties/new"
          className="text-sm font-medium text-sky-700 hover:underline"
        >
          Add property
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No properties yet.{" "}
            <Link href="/properties/new" className="text-sky-700 underline">
              Add your first property
            </Link>{" "}
            to start tracking compliance.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`/properties/${p.id}`}
                className="flex flex-col gap-2 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-slate-500">
                    {p.unit_count} {p.unit_count === 1 ? "unit" : "units"} ·{" "}
                    {p.controllers.length === 0
                      ? "no controller connected"
                      : p.controllers.map((c) => c.name).join(", ")}
                  </p>
                </div>
                <span
                  className={`self-start rounded-full px-3 py-1 text-xs font-medium sm:self-auto ${ROLLUP_BADGES[p.rollup].className}`}
                >
                  {ROLLUP_BADGES[p.rollup].label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Recent alerts feed */}
      <h2 className="mt-8 text-lg font-semibold">Recent alerts</h2>
      {(recentAlerts?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No alerts yet — they appear here when a property goes out of
          compliance.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recentAlerts!.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOTS[a.severity] ?? "bg-slate-400"}`}
              />
              <div className="min-w-0">
                <p className="text-sm text-slate-800">{a.message}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(a.created_at).toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {a.acknowledged ? " · acknowledged" : ` · ${a.severity}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
