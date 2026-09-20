import Link from "next/link";
import {
  formatDuration,
  type BenchmarkSummary,
} from "@/lib/rules/benchmarks";

/**
 * Which properties act quickly when Driplin can't fix something
 * itself, and which don't.
 *
 * The framing matters more than the numbers. A property missing from
 * this table has never needed a hand-fix — usually because Driplin
 * corrects its controller remotely — and that is the best possible
 * outcome, not missing data. The empty state and the footnote both
 * say so, because a bare ranking invites the opposite reading.
 */
export function ResponseTimes({ summary }: { summary: BenchmarkSummary }) {
  const { ranked, waitingOnly, portfolioAverageHours, totalFixes, openNow } =
    summary;

  if (ranked.length === 0 && waitingOnly.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">
          Nothing to rank yet. This fills in once a controller needs a
          change Driplin can&apos;t make remotely — properties it can
          correct on its own never wait on anyone.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-slate-200 px-4 py-3">
        <p className="text-sm text-slate-600">
          Portfolio average{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatDuration(portfolioAverageHours)}
          </span>{" "}
          <span className="text-slate-400">
            across {totalFixes} {totalFixes === 1 ? "fix" : "fixes"}
          </span>
        </p>
        {openNow > 0 && (
          <p className="text-sm font-medium text-amber-800">
            {openNow} waiting right now
          </p>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Property</th>
            <th className="px-4 py-2 text-right font-medium">Fixes</th>
            <th className="px-4 py-2 text-right font-medium">Average</th>
            <th className="px-4 py-2 text-right font-medium">Slowest</th>
            <th className="px-4 py-2 text-right font-medium">Waiting now</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ranked.map((r) => (
            <tr key={r.propertyId} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <Link
                  href={`/properties/${r.propertyId}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {r.name}
                </Link>
                {r.unverifiedAttempts > 0 && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {r.unverifiedAttempts} confirmed but still wrong
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                {r.fixes}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                {formatDuration(r.averageHours)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                {formatDuration(r.slowestHours)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.openCount > 0 ? (
                  <span className="font-medium text-amber-800">
                    {formatDuration(r.oldestOpenHours)}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}

          {waitingOnly.map((r) => (
            <tr key={r.propertyId} className="bg-amber-50/40 hover:bg-amber-50">
              <td className="px-4 py-2.5">
                <Link
                  href={`/properties/${r.propertyId}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td
                colSpan={3}
                className="px-4 py-2.5 text-right text-xs text-slate-500"
              >
                first fix still outstanding
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums text-amber-800">
                {formatDuration(r.oldestOpenHours)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        Measured from the first time Driplin flagged a change it
        couldn&apos;t make itself, to the confirmation that checked out
        when Driplin re-read the controller. Properties absent from this
        list have never needed a hand-fix. A single fix is a data point,
        not a trend — the count is there so you can tell the difference.
      </p>
    </div>
  );
}
