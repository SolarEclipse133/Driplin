import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWateringDigit } from "@/lib/rules/address";
import { ImportProperties } from "@/components/import-properties";
import { importProperties } from "./import-actions";

export default async function PropertiesPage() {
  const supabase = await createClient();
  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, name, street_number, street_name, city, zip, unit_count, no_street_address")
    .is("archived_at", null)
    .order("name");

  // Archived properties keep their full compliance record and stay
  // reachable, just out of the working list.
  const { data: archived } = await supabase
    .from("properties")
    .select("id, name, city, archived_at, archive_reason")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Properties</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ImportProperties action={importProperties} />
          <Link
            href="/properties/new"
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            Add property
          </Link>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          Could not load properties: {error.message}. If this persists, the
          database may be missing migration 0002 — see SETUP.md.
        </p>
      )}

      {!error && (properties?.length ?? 0) === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No properties yet. Add your first property to start tracking
            compliance.
          </p>
        </div>
      )}

      {!error && (properties?.length ?? 0) > 0 && (
        <ul className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {properties!.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-slate-500">
                  {p.street_number} {p.street_name}, {p.city} {p.zip} ·{" "}
                  {p.unit_count} {p.unit_count === 1 ? "unit" : "units"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800"
                  title="Austin assigns watering days by the last digit of the street number"
                >
                  {p.no_street_address
                    ? "No street address"
                    : `Watering digit: ${getWateringDigit(p.street_number ?? "") ?? "?"}`}
                </span>
                <Link
                  href={`/properties/${p.id}`}
                  className="text-sm font-medium text-sky-700 hover:underline"
                >
                  Manage
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* A kept record nobody can reach is no better than a deleted one. */}
      {(archived?.length ?? 0) > 0 && (
        <details className="mt-8 border-t border-slate-200 pt-6">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            {archived!.length} archived propert
            {archived!.length === 1 ? "y" : "ies"}
          </summary>
          <p className="mt-2 text-sm text-slate-500">
            Not monitored and not billed for. Their compliance records are
            intact, so you can still produce a board report or show a city what
            these properties did.
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {archived!.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.city ? `${p.city} · ` : ""}archived{" "}
                    {new Date(p.archived_at as string).toLocaleDateString(
                      "en-US",
                      { timeZone: "America/Chicago" }
                    )}
                    {p.archive_reason ? ` · ${p.archive_reason}` : ""}
                  </p>
                </div>
                <Link
                  href={`/properties/${p.id}`}
                  className="text-sm font-medium text-sky-700 hover:underline"
                >
                  View record
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
