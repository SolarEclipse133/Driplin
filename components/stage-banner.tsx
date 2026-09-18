import { createClient } from "@/lib/supabase/server";
import { DroughtStage, getJurisdiction } from "@/lib/jurisdictions";

/**
 * The auditable "verified as of" label: which stage is active for a
 * city, when it was confirmed, and the official source it was verified
 * against. Shown once per city the organization has properties in.
 */

export async function StageBanner({
  jurisdictionIds,
}: {
  /** Which cities to show. Omitted = every city with a stage row. */
  jurisdictionIds?: string[];
}) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("drought_stage_status")
    .select("jurisdiction, current_stage, confirmed_at, source_link");

  const visible = (rows ?? []).filter(
    (r) => !jurisdictionIds || jurisdictionIds.includes(r.jurisdiction)
  );
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((row) => {
        const j = getJurisdiction(row.jurisdiction);
        const stage = (row.current_stage ?? 0) as DroughtStage;
        const rule = j.stages[stage];
        return (
          <div
            key={row.jurisdiction}
            className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold text-sky-900">
                {j.name}: {rule.name} watering restrictions in effect
              </span>
              <span className="text-xs text-sky-800">
                {row.confirmed_at ? (
                  <>
                    verified as of{" "}
                    {new Date(row.confirmed_at).toLocaleDateString("en-US", {
                      timeZone: "America/Chicago",
                      dateStyle: "medium",
                    })}
                    {row.source_link && (
                      <>
                        {" — "}
                        <a
                          href={row.source_link}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          official source
                        </a>
                      </>
                    )}
                  </>
                ) : (
                  "default stage — not yet verified against an official notice"
                )}
              </span>
            </div>
            <p className="mt-1 text-sm text-sky-800">{rule.summary}</p>
          </div>
        );
      })}
    </div>
  );
}
