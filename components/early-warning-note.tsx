import { EarlyWarningNote } from "@/lib/indicators/notes";

/**
 * Low-urgency heads-up for property managers. Styled deliberately
 * quieter than a compliance alert: nothing is wrong yet, and the
 * estimate may never come true.
 */
export function EarlyWarningNotes({ notes }: { notes: EarlyWarningNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <div
          key={n.jurisdictionId}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3"
        >
          <p className="text-sm text-slate-700">
            <span className="font-medium">Heads up — {n.jurisdictionName}:</span>{" "}
            water supply has been falling steadily. If it keeps up at this
            rate, {n.utility} could be looking at{" "}
            <strong>{n.projectedStageName}</strong> in roughly {n.daysAway}{" "}
            days.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            This is a rough estimate from recent readings, not a forecast —
            rain can change it completely. Nothing about your schedules has
            changed.{" "}
            <a
              href={n.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {n.utility} notices
            </a>
          </p>
        </div>
      ))}
    </div>
  );
}
