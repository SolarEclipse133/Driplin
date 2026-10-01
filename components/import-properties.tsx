"use client";

import { useActionState, useState } from "react";
import {
  EMPTY_IMPORT_STATE,
  IMPORT_TEMPLATE_HEADERS,
  type ImportState,
} from "@/lib/properties/import";

/**
 * Bring a portfolio in from a spreadsheet.
 *
 * Two steps on purpose. The preview is not a convenience, it is the
 * safety mechanism: a single wrong column in a forty-row file becomes
 * forty properties judged against the wrong city table, all in the same
 * direction, with nobody looking at any individual row. So the preview
 * shows the watering-relevant fields -- address, class, irrigation type,
 * which utility's rules apply -- not just names.
 */
export function ImportProperties({
  action,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_IMPORT_STATE);
  const [open, setOpen] = useState(false);

  const preview = state.preview;
  const clean = preview !== null && preview.problems.length === 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
      >
        Import from a spreadsheet
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Import properties</h2>
          <p className="mt-1 text-sm text-slate-500">
            A CSV with one property per row. Driplin shows you everything it
            read before creating anything.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-sm text-slate-500 underline"
        >
          Close
        </button>
      </div>

      <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
        {IMPORT_TEMPLATE_HEADERS.join(",")}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Only name, street number, street name, ZIP and unit count are required.
        Leave the street number blank, or write &quot;none&quot;, for a median
        or common area that has no address. Class defaults to commercial and
        irrigation to automatic — the usual case for HOA common areas.
      </p>

      <form action={formAction} className="mt-4">
        <label className="block text-sm">
          <span className="font-medium">CSV file</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv,text/plain"
            className="mt-1 block w-full text-sm"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="font-medium">…or paste the rows</span>
          <textarea
            name="csv"
            rows={5}
            defaultValue={state.csv ?? ""}
            placeholder={`${IMPORT_TEMPLATE_HEADERS.slice(0, 6).join(",")}\nZilker Terrace,2108,Barton Springs Rd,Austin,78704,120`}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Reading…" : "Check the file"}
        </button>
      </form>

      {state.error && (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.success}
        </p>
      )}

      {preview && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          {preview.problems.length > 0 ? (
            <>
              <p className="text-sm font-semibold text-red-900">
                {preview.problems.length} thing
                {preview.problems.length === 1 ? "" : "s"} to fix first
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Nothing has been imported. Driplin imports a file completely or
                not at all — a skipped row is a property nobody is watching
                that its manager believes is covered.
              </p>
              <ul className="mt-2 space-y-1">
                {preview.problems.map((p, i) => (
                  <li key={i} className="text-sm text-red-900">
                    <span className="font-mono text-xs">
                      line {p.line} · {p.column}
                    </span>{" "}
                    — {p.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm font-semibold text-slate-800">
              {preview.rows.length} propert
              {preview.rows.length === 1 ? "y" : "ies"} read. Check these before
              importing.
            </p>
          )}

          {preview.ignoredColumns.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Columns Driplin does not use, and ignored:{" "}
              {preview.ignoredColumns.join(", ")}.
            </p>
          )}

          {preview.rows.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">Name</th>
                    <th className="py-1 pr-3">Address</th>
                    <th className="py-1 pr-3">Units</th>
                    <th className="py-1 pr-3">Judged as</th>
                    <th className="py-1 pr-3">Rules</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((r) => (
                    <tr
                      key={r.line}
                      className={r.duplicateOf ? "text-amber-800" : ""}
                    >
                      <td className="py-1.5 pr-3 font-medium">
                        {r.name}
                        {r.duplicateOf && (
                          <span className="ml-1 font-normal">
                            (already have &ldquo;{r.duplicateOf}&rdquo;)
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">{r.address}</td>
                      <td className="py-1.5 pr-3">{r.units}</td>
                      <td className="py-1.5 pr-3">
                        {r.propertyClass === "commercial"
                          ? "Commercial"
                          : "Residential"}
                        ,{" "}
                        {r.irrigationType === "automatic"
                          ? "automatic"
                          : "drip/hose"}
                      </td>
                      <td className="py-1.5 pr-3">{r.jurisdictionName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                &ldquo;Judged as&rdquo; and &ldquo;Rules&rdquo; decide which
                published watering table each property is held to. If a row is
                wrong there, it will be wrong every night — fix it in the file
                rather than after importing.
              </p>
            </div>
          )}

          {preview.blocked && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {preview.blocked}
            </p>
          )}

          {clean && !preview.blocked && (
            <form action={formAction} className="mt-4">
              <input type="hidden" name="csv" value={state.csv ?? ""} />
              <input type="hidden" name="confirm" value="true" />
              {preview.duplicateCount > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="skip_duplicates" defaultChecked />
                  Skip the {preview.duplicateCount} already in my portfolio
                </label>
              )}
              <button
                type="submit"
                disabled={pending}
                className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending
                  ? "Importing…"
                  : `Import ${preview.rows.length - preview.duplicateCount} propert${preview.rows.length - preview.duplicateCount === 1 ? "y" : "ies"}`}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
