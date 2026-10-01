import { redirect } from "next/navigation";
import { cronConfig, getJobHealth } from "@/lib/jobs/runs";
import { STALE_AFTER_HOURS, type JobHealth } from "@/lib/jobs/health";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_STAGES,
  DroughtStage,
  JURISDICTIONS,
  getJurisdiction,
} from "@/lib/jurisdictions";
import { PullIndicatorForm, ConfirmStageForm } from "@/components/admin-forms";
import { analyzeTrend } from "@/lib/indicators/trend";
import { acknowledgeAlert, confirmStage, pullIndicatorNow ,
  setOrgPlan,
} from "./actions";
import { AdminPlans, type OrgPlanRow } from "@/components/admin-plans";

/**
 * Confirming a stage now re-checks every organization with property in
 * that city and writes to each of them, which is network-bound work
 * inside a request. 60s is Vercel's Hobby ceiling; organizations beyond
 * the inline cap are deferred to the nightly run and reported as such.
 */
export const maxDuration = 60;

function centralTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function NightlyRunPanel({
  health,
  config,
}: {
  health: JobHealth;
  config: { secretSet: boolean; adminKeySet: boolean };
}) {
  const tone = health.neverRun
    ? "border-slate-200 bg-slate-50 text-slate-700"
    : health.stale
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <div className={`mt-3 rounded-xl border p-4 text-sm ${tone}`}>
      {health.neverRun ? (
        <div>
          <p>The nightly job has not run yet on this deployment.</p>
          {/* "Never run" is ambiguous on its own: the schedule may simply
              not have come round, or the job may be failing to
              authenticate before it can record anything. Name the two. */}
          {!config.secretSet || !config.adminKeySet ? (
            <p className="mt-2 font-semibold text-red-900">
              It also cannot authenticate itself:{" "}
              {!config.secretSet && "CRON_SECRET is not set"}
              {!config.secretSet && !config.adminKeySet && " and "}
              {!config.adminKeySet && "SUPABASE_SERVICE_ROLE_KEY is not set"}
              . Until that is fixed in Vercel (and the project redeployed),
              the job will be rejected before it can record anything.
            </p>
          ) : (
            <p className="mt-2 text-xs opacity-80">
              Its credentials are configured, so this is expected until the
              next scheduled run. If it is still saying this a day after the
              schedule should have fired, check CRON_SECRET in Vercel matches
              what the cron sends.
            </p>
          )}
        </div>
      ) : health.stale ? (
        <p className="font-semibold">
          {health.lastSuccessAt
            ? `Last successful run was ${Math.round(health.hoursSinceSuccess!)} hours ago. Monitoring has stopped.`
            : "The job has run but never succeeded. Monitoring has stopped."}
        </p>
      ) : (
        <p>
          Last successful run{" "}
          {new Date(health.lastSuccessAt!).toLocaleString("en-US", {
            timeZone: "America/Chicago",
          })}{" "}
          ({Math.round(health.hoursSinceSuccess!)}h ago).
        </p>
      )}
      {health.lastError && (
        <p className="mt-2 rounded-md bg-white/70 px-3 py-2 font-mono text-xs">
          {health.lastError}
        </p>
      )}
      <p className="mt-2 text-xs opacity-80">
        Every customer dashboard shows a warning once this passes{" "}
        {STALE_AFTER_HOURS} hours.
      </p>
    </div>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  // Plans across every organization, with how many properties each has.
  const { data: planRows } = await supabase
    .from("subscriptions")
    .select("org_id, plan, status, property_limit, trial_ends_at, notes, organizations(name)")
    .order("created_at");
  const { data: allProperties } = await supabase
    .from("properties")
    .select("org_id");
  const propertyCounts = new Map<string, number>();
  for (const row of allProperties ?? []) {
    const key = row.org_id as string;
    propertyCounts.set(key, (propertyCounts.get(key) ?? 0) + 1);
  }
  const orgPlans: OrgPlanRow[] = (planRows ?? []).map((r) => {
    const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
    return {
      orgId: r.org_id as string,
      orgName: (org?.name as string) ?? "(unnamed)",
      plan: r.plan as string,
      status: r.status as string,
      propertyLimit: r.property_limit as number | null,
      propertyCount: propertyCounts.get(r.org_id as string) ?? 0,
      trialEndsAt: r.trial_ends_at as string | null,
      notes: r.notes as string | null,
    };
  });

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

  const jobHealth = await getJobHealth(supabase);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Drought stage administration</h1>
      <p className="mt-1 text-sm text-slate-500">
        Water-supply gauges only ever suggest; the stage that drives
        customer schedules is what you confirm here, city by city, against
        each utility&apos;s official notice.
      </p>

      {/* Is Driplin itself still running? Above the alerts, because a
          stopped job means the alert list below is stale too. */}
      <h2 className="mt-8 text-lg font-semibold">Nightly check</h2>
      <NightlyRunPanel health={jobHealth} config={cronConfig()} />

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
    
      <h2 className="mt-10 text-lg font-semibold">Plans</h2>
      <p className="mt-1 text-sm text-slate-500">
        What each company is entitled to. Limits gate adding properties;
        they never pause monitoring of properties already set up.
      </p>
      <AdminPlans action={setOrgPlan} orgs={orgPlans} />

      </div>
  );
}
