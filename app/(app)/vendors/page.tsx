import { createClient } from "@/lib/supabase/server";
import { VendorForm } from "@/components/vendor-form";
import { createVendor, deleteVendor, toggleVendorProperty } from "./actions";

export default async function VendorsPage() {
  const supabase = await createClient();

  const [{ data: vendors }, { data: properties }, { data: links }] =
    await Promise.all([
      supabase
        .from("vendors")
        .select("id, name, contact_name, email, phone")
        .order("name"),
      supabase.from("properties").select("id, name").order("name"),
      supabase.from("vendor_properties").select("vendor_id, property_id"),
    ]);

  const assigned = new Set(
    (links ?? []).map((l) => `${l.vendor_id}:${l.property_id}`)
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Vendors</h1>
      <p className="mt-1 text-sm text-slate-500">
        The landscapers and irrigation crews who service your properties.
        When a controller needs a hands-on change, you can send the job
        straight to the vendor who covers that property.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Your vendors</h2>
      {(vendors?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No vendors yet. Add one below.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {vendors!.map((v) => (
            <li
              key={v.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{v.name}</p>
                  <p className="text-sm text-slate-500">
                    {[v.contact_name, v.email, v.phone]
                      .filter(Boolean)
                      .join(" · ") || "No contact details"}
                  </p>
                </div>
                <form action={deleteVendor}>
                  <input type="hidden" name="vendor_id" value={v.id} />
                  <button className="rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                    Remove
                  </button>
                </form>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Services these properties
                </p>
                {(properties?.length ?? 0) === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Add a property first.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {properties!.map((p) => {
                      const isOn = assigned.has(`${v.id}:${p.id}`);
                      return (
                        <form key={p.id} action={toggleVendorProperty}>
                          <input type="hidden" name="vendor_id" value={v.id} />
                          <input type="hidden" name="property_id" value={p.id} />
                          <input
                            type="hidden"
                            name="assigned"
                            value={String(isOn)}
                          />
                          <button
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                              isOn
                                ? "border-sky-300 bg-sky-50 text-sky-900"
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            {isOn ? "✓ " : "+ "}
                            {p.name}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-semibold">Add a vendor</h2>
      <div className="mt-3">
        <VendorForm action={createVendor} />
      </div>
    </div>
  );
}
