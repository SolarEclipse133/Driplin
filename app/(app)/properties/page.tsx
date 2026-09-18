import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWateringDigit } from "@/lib/rules/address";

export default async function PropertiesPage() {
  const supabase = await createClient();
  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, name, street_number, street_name, city, zip, unit_count")
    .order("name");

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Properties</h1>
        <Link
          href="/properties/new"
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
        >
          Add property
        </Link>
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
                  Watering digit: {getWateringDigit(p.street_number) ?? "?"}
                </span>
                <Link
                  href={`/properties/${p.id}/edit`}
                  className="text-sm font-medium text-sky-700 hover:underline"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
