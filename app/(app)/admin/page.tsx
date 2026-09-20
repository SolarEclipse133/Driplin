import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_STAGES,
  DroughtStage,
  JURISDICTIONS,
  getJurisdiction,
} from "@/lib/jurisdictions";
import { PullIndicatorForm, ConfirmStageForm } from "@/components/admin-forms";
import { analyzeTrend } from "@/lib/indicators/trend";
import { acknowledgeAlert, confirmStage, pullIndicatorNow } from "./actions";

function centralTime(iso: string | null | undefined): string {
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

  const { data: statusRows } = await supabase
    .from("drought_stage_status")
    .select(
      "jurisdiction, current_stage, confirmed_at, source_link, raw_indicator_value, raw_indicator_text, raw_indicator_read_at, profiles(full_name)"
    );

  const { data: readings } = await supabase
    .from("indicator_readings")
    .select("jurisdiction, value, read_at, reading_date")
    .order("reading_date", { ascending: false })
    .limit(200);

  const { data: openAlerts } = await supabase
    .from("alerts")
    .select("id, message, severity, created_at, jurisdiction, type")
    .eq("acknowledged", false)
    .is("org_id", null)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Drought stage administration</h1>
      <p className="mt-1 text-sm text-slate-500">
        Water-supply gauges only ever suggest; the stage that drives
        customer schedules is what you confirm here, city by city, against
        each utility&apos;s official notice.
      </p>

      {/* Internal alerts across all cities */}
      <h2 className="mt-8 text-lg font-semibold">Internal alerts</h2>
      {(openAlerts?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Nothing needs attention. Threshold crossings appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {openAlerts!.map((a) => (
            <li
              key={a.id}
              className={`flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                a.type === "early_warning"
                  ? "border-slate-200 bg-white"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div>
                {a.type === "early_warning" && (
                  <span className="mb-1 inline-block rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                    Early warning · estimate
                  </span>
                )}
                <p
                  className={`text-sm ${a.type === "early_warning" ? "text-slate-700" : "text-amber-900"}`}
                >
                  {a.message}
                </p>
                <p
                  className={`mt-1 text-xs ${a.type === "early_warning" ? "text-slate-500" : "text-amber-700"}`}
                >
                  {centralTime(a.created_at)}
                </p>
              </div>
              <form action={acknowledgeAlert}>
                <input type="hidden" name="alert_id" value={a.id} />
                <button className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                  Acknowledge
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* One panel per city */}
      {JURISDICTIONS.map((j) => {
        const row = (statusRows ?? []).find((r) => r.jurisdiction === j.id);
        const currentStage = (row?.current_stage ?? 0) as DroughtStage;
        const confirmedBy = Array.isArray(row?.profiles)
          ? row?.profiles[0]
          : row?.profiles;
        const value =
          row?.raw_indicator_value != null ? Number(row.raw_indicator_value) : null;
        const suggested =
          value !== null && j.indicator ? j.indicator.suggestStage(value) : null;

        return (
          <section key={j.id} className="mt-10 border-t border-slate-200 pt-6">
            <h2 className="text-lg font-semibold">
              {j.name}{" "}
              <span className="text-sm font-normal text-slate-500">
                · {j.utility}
              </span>
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-500">
                  Confirmed stage (drives schedules here)
                </h3>
                <p className="mt-2 text-2xl font-bold">
                  {j.stages[currentStage].name}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {row?.confirmed_at ? (
                    <>
                      Verified {centralTime(row.confirmed_at)}
                      {confirmedBy?.full_name ? ` by ${confirmedBy.full_name}` : ""}
                      {row.source_link && (
                        <>
                          {" · "}
                          <a
                            href={row.source_link}
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
                    "Never confirmed — using the default until you confirm below."
                  )}
                </p>
                {!j.stages[currentStage].verified && (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Driplin has not verified {j.utility}&apos;s published rules
                    for this stage, so properties here are flagged for manual
                    review instead of auto-corrected.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-500">
                  Latest reading (informational only)
                </h3>
                {j.indicator ? (
                  <>
                    {value !== null ? (
                      <>
                        <p className="mt-2 text-2xl font-bold">
                          {row?.raw_indicator_text ?? value.toLocaleString()}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {j.indicator.label} · pulled{" "}
                          {centralTime(row?.raw_indicator_read_at)} · suggests{" "}
                          <strong>
                            {j.stages[suggested as DroughtStage].name}
                          </strong>
                          {suggested !== currentStage &&
                            " — differs from confirmed stage"}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">
                        No reading yet. The nightly job fills this in, or pull
                        one now. Source: {j.indicator.label}.
                      </p>
                    )}
                    {(() => {
                      const points = (readings ?? [])
                        .filter((r) => r.jurisdiction === j.id)
                        .map((r) => ({
                          value: Number(r.value),
                          readAt: r.read_at as string,
                        }));
                      const t = analyzeTrend(points, j.indicator!.thresholds);
                      return (
                        <p
                          className={`mt-3 rounded-md px-3 py-2 text-xs ${
                            t.warn
                              ? "bg-sky-50 text-sky-900"
                              : "bg-slate-50 text-slate-600"
                          }`}
                        >
                          <span className="font-medium">
                            Trend ({points.length} reading
                            {points.length === 1 ? "" : "s"} stored):
                          </span>{" "}
                          {t.explanation}
                        </p>
                      );
                    })()}
                    <PullIndicatorForm
                      action={pullIndicatorNow.bind(null, j.id)}
                      label={j.name}
                    />
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    No automated indicator for this city — stages are confirmed
                    manually from the utility&apos;s notices.
                  </p>
                )}
              </div>
            </div>

            <h3 className="mt-6 text-sm font-semibold">
              Confirm the active stage for {j.name}
            </h3>
            <ConfirmStageForm
              action={confirmStage.bind(null, j.id)}
              currentStage={currentStage}
              utility={j.utility}
              officialUrl={j.officialUrl}
              stageOptions={ALL_STAGES.map((s) => ({
                value: s,
                label: getJurisdiction(j.id).stages[s].name,
                verified: getJurisdiction(j.id).stages[s].verified,
              }))}
            />
          </section>
        );
      })}
    </div>
  );
}
