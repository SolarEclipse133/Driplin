import { createClient } from "@/lib/supabase/server";
import {
  DroughtStage,
  STAGE_NAMES,
  STAGE_RULES,
} from "@/lib/rules/watering-config";

/**
 * The auditable "verified as of" label shown to property managers:
 * which stage is active, when it was confirmed, and the official
 * source it was verified against.
 */
export async function StageBanner() {
  const supabase = await createClient();
  const { data: status } = await supabase
    .from("drought_stage_status")
    .select("current_stage, confirmed_at, source_link")
    .single();

  const stage = (status?.current_stage ?? 0) as DroughtStage;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-sky-900">
          {STAGE_NAMES[stage]} watering restrictions in effect
        </span>
        <span className="text-xs text-sky-800">
          {status?.confirmed_at ? (
            <>
              verified as of{" "}
              {new Date(status.confirmed_at).toLocaleDateString("en-US", {
                timeZone: "America/Chicago",
                dateStyle: "medium",
              })}
              {status.source_link && (
                <>
                  {" — "}
                  <a
                    href={status.source_link}
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
      <p className="mt-1 text-sm text-sky-800">{STAGE_RULES[stage].summary}</p>
    </div>
  );
}
