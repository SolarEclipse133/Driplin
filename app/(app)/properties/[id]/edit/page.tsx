import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PropertyForm } from "@/components/property-form";
import { updateProperty, deleteProperty } from "../../actions";
import { DeletePropertyButton } from "@/components/delete-property-button";

export default async function EditPropertyPage({
  params,
}: PageProps<"/properties/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name, street_number, street_name, city, zip, unit_count")
    .eq("id", id)
    .single();

  if (!property) notFound();

  const updateWithId = updateProperty.bind(null, property.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Edit property</h1>
      <p className="mt-1 text-sm text-slate-500">{property.name}</p>

      <div className="mt-6">
        <PropertyForm
          action={updateWithId}
          initialValues={{
            name: property.name,
            street_number: property.street_number,
            street_name: property.street_name,
            city: property.city,
            zip: property.zip,
            unit_count: property.unit_count,
          }}
          submitLabel="Save changes"
        />
      </div>

      <div className="mt-10 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-500">
          Removing a property deletes its compliance history too.
        </p>
        <form action={deleteProperty} className="mt-3">
          <input type="hidden" name="property_id" value={property.id} />
          <DeletePropertyButton propertyName={property.name} />
        </form>
      </div>
    </div>
  );
}
