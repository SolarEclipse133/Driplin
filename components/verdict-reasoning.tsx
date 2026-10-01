import type { Explanation } from "@/lib/rules/explain";

/**
 * Why Driplin reached the verdict above.
 *
 * Collapsed, because most of the time nobody needs it. Present, because
 * the moment somebody disagrees with a verdict — or has to defend one to a
 * board — this is the difference between an assertion and evidence.
 */
export function VerdictReasoning({
  explanation,
  checkedAt,
}: {
  explanation: Explanation;
  checkedAt?: string | null;
}) {
  return (
    <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-medium text-slate-700">
        How Driplin judged this
      </summary>

      <p className="mt-2 text-sm text-slate-700">{explanation.headline}</p>

      <ul className="mt-2 space-y-1">
        {explanation.points.map((point, i) => (
          <li key={i} className="text-sm text-slate-600">
            • {point}
          </li>
        ))}
      </ul>

      {explanation.caveat && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {explanation.caveat}
        </p>
      )}

      {checkedAt && (
        <p className="mt-2 text-xs text-slate-500">
          Checked{" "}
          {new Date(checkedAt).toLocaleString("en-US", {
            timeZone: "America/Chicago",
            dateStyle: "medium",
            timeStyle: "short",
          })}
          .
        </p>
      )}
    </details>
  );
}
