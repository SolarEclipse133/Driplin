import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PropertyForm } from "@/components/property-form";
import {
  updateProperty,
  archiveProperty,
  restoreProperty,
  purgeProperty,
} from "../../actions";
import { ArchiveProperty, PurgeProperty } from "@/components/archive-property";

export default async function EditPropertyPage({
  params,
}: PageProps<"/properties/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name, street_number, street_name, city, zip, unit_count, jurisdiction, property_class, irrigation_type, no_street_address, assigned_to, archived_at, archive_reason")
    .eq("id", id)
    .single();

  if (!property) notFound();

  // Everyone on this account, so a property can be routed to one of them.
  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, full_name, email");
  const members = (memberRows ?? []).map((m) => ({
    id: m.id as string,
    label: (m.full_name as string)?.trim() || (m.email as string) || "Unnamed",
  }));

  const updateWithId = updateProperty.bind(null, property.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Edit property</h1>
      <p className="mt-1 text-sm text-slate-500">{property.name}</p>

      <div className="mt-6">
        <PropertyForm
          action={updateWithId}
          members={members}
          initialValues={{
            name: property.name,
            street_number: property.street_number ?? "",
            street_name: property.street_name,
            city: property.city,
            zip: property.zip,
            unit_count: property.unit_count,
            jurisdiction: property.jurisdiction ?? "austin",
            property_class: property.property_class ?? "commercial",
            irrigation_type: property.irrigation_type ?? "automatic",
            no_street_address: property.no_street_address ?? false,
            assigned_to: property.assigned_to ?? "",
          }}
          submitLabel="Save changes"
        />
      </div>

      <div className="mt-10 border-t border-slate-200 pt-6">
        {property.archived_at ? (
          <>
            <h2 className="text-sm font-semibold">Archived</h2>
            <p className="mt-1 text-sm text-slate-500">
              Archived{" "}
              {new Date(property.archived_at as string).toLocaleDateString(
                "en-US",
                { timeZone: "America/Chicago" }
              )}
              {property.archive_reason ? ` — ${property.archive_reason}` : ""}.
              Its compliance record is intact and Driplin is not monitoring or
              billing for it.
            </p>
            <form action={restoreProperty} className="mt-3">
              <input type="hidden" name="property_id" value={property.id} />
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Restore to portfolio
              </button>
            </form>
            {/* The permanent option lives here and nowhere else: you
                have to archive first, so no tidy-up reaches it. */}
            <form action={purgeProperty}>
              <input type="hidden" name="property_id" value={property.id} />
              <PurgeProperty propertyName={property.name} />
            </form>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold">Leaving the portfolio</h2>
            <p className="mt-1 text-sm text-slate-500">
              Archiving takes this property off the dashboard and stops
              monitoring and billing for it. Its compliance history is kept —
              you may still need it if a city or a board asks later — and you
              can restore it at any time.
            </p>
            <form action={archiveProperty} className="mt-3">
              <ArchiveProperty
                propertyName={property.name}
                propertyId={property.id}
              />
            </form>
          </>
        )}
      </div>
    </div>
  );
}
