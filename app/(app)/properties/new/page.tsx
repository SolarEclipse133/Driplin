import { PropertyForm } from "@/components/property-form";
import { createClient } from "@/lib/supabase/server";
import { createProperty } from "../actions";

export default async function NewPropertyPage() {
  const supabase = await createClient();

  // Everyone on this account, so a property can be routed to one of
  // them rather than alerting the whole team.
  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, full_name, email");
  const members = (memberRows ?? []).map((m) => ({
    id: m.id as string,
    label: (m.full_name as string)?.trim() || (m.email as string) || "Unnamed",
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Add property</h1>
      <p className="mt-1 text-sm text-slate-500">
        A property is a community or building you manage.
      </p>
      <div className="mt-6">
        <PropertyForm
          action={createProperty}
          members={members}
          submitLabel="Add property"
        />
      </div>
    </div>
  );
}
