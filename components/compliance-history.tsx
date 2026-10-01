import type { ComplianceHistory } from "@/lib/rules/history";

const SWATCH: Record<string, string> = {
  compliant: "bg-emerald-500",
  violation: "bg-red-500",
  unchecked: "bg-slate-200",
};

const WORD: Record<string, string> = {
  compliant: "compliant",
  violation: "something wrong",
  unchecked: "not checked",
};

/**
 * The season so far, one square per day.
 *
 * Every other view in Driplin is "right now". This is the one that answers
 * "how have we done", which is the question at renewal and the one a board
 * asks before approving next year's budget.
 *
 * Days nobody checked are their own colour rather than being quietly
 * shaded as fine. A record with holes in it should look like a record with
 * holes in it.
 */
export function ComplianceHistoryStrip({
  history,
  summary,
}: {
  history: ComplianceHistory;
  summary: string;
}) {
  if (history.totalDays === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-700">{summary}</p>

      <div className="mt-3 flex flex-wrap gap-[3px]" role="img" aria-label={summary}>
        {history.days.map((d) => (
          <span
            key={d.date}
            // The native tooltip is enough here: the whole strip already
            // carries the summary as its accessible name.
            title={`${d.date}: ${WORD[d.status]}`}
            className={`h-3 w-3 rounded-[2px] ${SWATCH[d.status]}`}
          />
        ))}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-emerald-500" />
          <dt>Compliant</dt>
          <dd className="font-medium">{history.compliantDays}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-red-500" />
          <dt>Something wrong</dt>
          <dd className="font-medium">{history.violationDays}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-slate-200" />
          <dt>Not checked</dt>
          <dd className="font-medium">{history.uncheckedDays}</dd>
        </div>
        {history.longestCompliantRun > 1 && (
          <div className="flex items-center gap-1.5">
            <dt>Longest clean run</dt>
            <dd className="font-medium">
              {history.longestCompliantRun} days
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
