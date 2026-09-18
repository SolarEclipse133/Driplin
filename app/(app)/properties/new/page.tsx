import { PropertyForm } from "@/components/property-form";
import { createProperty } from "../actions";

export default function NewPropertyPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Add property</h1>
      <p className="mt-1 text-sm text-slate-500">
        A property is a community or building you manage.
      </p>
      <div className="mt-6">
        <PropertyForm action={createProperty} submitLabel="Add property" />
      </div>
    </div>
  );
}
