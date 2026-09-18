import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DroughtStage,
  STAGE_NAMES,
  suggestedStageForReading,
} from "@/lib/rules/watering-config";
import { PullLcraForm, ConfirmStageForm } from "@/components/admin-forms";
import { acknowledgeAlert, confirmStage, pullLcraNow } from "./actions";

function centralTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: status } = await supabase
    .from("drought_stage_status")
    .select(
      "current_stage, confirmed_at, source_link, raw_lcra_reading, raw_lcra_percent, raw_lcra_read_at, profiles(full_name)"
    )
    .single();

  const currentStage = (status?.current_stage ?? 0) as DroughtStage;
  const confirmedBy = Array.isArray(status?.profiles)
    ? status?.profiles[0]
    : status?.profiles;
  const reading = status?.raw_lcra_reading
    ? Number(status.raw_lcra_reading)
    : null;
  const suggested = reading !== null ? suggestedStageForReading(reading) : null;

  const { data: openAlerts } = await supabase
    .from("alerts")
    .select("id, message, severity, created_at")
    .eq("acknowledged", false)
    .is("org_id", null)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Drought stage administration</h1>
      <p className="mt-1 text-sm text-slate-500">
        The LCRA gauge only ever suggests; the stage that drives customer
        schedules is what you confirm here, against the official notice.
      </p>

      {/* Current state */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-500">
            Confirmed stage (drives all schedules)
          </h2>
          <p className="mt-2 text-2xl font-bold">{STAGE_NAMES[currentStage]}</p>
          <p className="mt-2 text-sm text-slate-600">
            {status?.confirmed_at ? (
              <>
                Verified {centralTime(status.confirmed_at)}
                {confirmedBy?.full_name ? ` by ${confirmedBy.full_name}` : ""}
                {status.source_link && (
                  <>
                    {" · "}
                    <a
                      href={status.source_link}
                      className="text-sky-700 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      source
                    </a>
                  </>
                )}
              </>
            ) : (
              "Never confirmed — using the default (Conservation Stage) until you confirm below."
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-500">
            Latest LCRA reading (informational only)
          </h2>
          {reading !== null ? (
            <>
              <p className="mt-2 text-2xl font-bold">
                {reading.toLocaleString()} acre-feet{" "}
                <span className="text-base font-medium text-slate-500">
                  ({status?.raw_lcra_percent})
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Pulled {centralTime(status?.raw_lcra_read_at ?? null)} · suggests{" "}
                <strong>{STAGE_NAMES[suggested as DroughtStage]}</strong>
                {suggested !== currentStage && " — differs from confirmed stage"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              No reading pulled yet. The nightly job fills this in, or pull
              one now.
            </p>
          )}
          <PullLcraForm action={pullLcraNow} />
        </div>
      </div>

      {/* Internal alerts */}
      <h2 className="mt-8 text-lg font-semibold">Internal alerts</h2>
      {(openAlerts?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Nothing needs attention. Threshold crossings will appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {openAlerts!.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm text-amber-900">{a.message}</p>
                <p className="mt-1 text-xs text-amber-700">
                  {centralTime(a.created_at)}
                </p>
              </div>
              <form action={acknowledgeAlert}>
                <input type="hidden" name="alert_id" value={a.id} />
                <button className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100">
                  Acknowledge
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* Stage confirmation */}
      <h2 className="mt-8 text-lg font-semibold">Confirm the active stage</h2>
      <ConfirmStageForm action={confirmStage} currentStage={currentStage} />
    </div>
  );
}
