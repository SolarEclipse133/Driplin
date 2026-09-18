"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PropertyFormState } from "@/app/(app)/properties/actions";

type PropertyValues = {
  name: string;
  street_number: string;
  street_name: string;
  city: string;
  zip: string;
  unit_count: number | "";
};

const EMPTY: PropertyValues = {
  name: "",
  street_number: "",
  street_name: "",
  city: "Austin",
  zip: "",
  unit_count: "",
};

export function PropertyForm({
  action,
  initialValues = EMPTY,
  submitLabel,
}: {
  action: (
    prev: PropertyFormState,
    formData: FormData
  ) => Promise<PropertyFormState>;
  initialValues?: PropertyValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    fieldErrors: {},
  });
  // Controlled values: React 19 resets uncontrolled form fields after a
  // server-action submit, which would wipe the user's input whenever
  // validation fails. Controlled inputs keep what they typed.
  const [values, setValues] = useState<PropertyValues>(initialValues);

  const field = (
    name: keyof PropertyValues,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        value={values[name]}
        onChange={(e) =>
          setValues((v) => ({ ...v, [name]: e.target.value }))
        }
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        {...props}
      />
      {state.fieldErrors[name] && (
        <p className="mt-1 text-sm text-red-700">{state.fieldErrors[name]}</p>
      )}
    </div>
  );

  return (
    <form action={formAction} className="max-w-lg space-y-4" noValidate>
      {field("name", "Property name", {
        placeholder: "Barton Creek Villas HOA",
      })}

      <div className="grid grid-cols-[8rem_1fr] gap-3">
        {field("street_number", "Street number", { placeholder: "1204" })}
        {field("street_name", "Street name", { placeholder: "W Oltorf St" })}
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        The street number matters: Austin assigns watering days by its last
        digit.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {field("city", "City")}
        {field("zip", "ZIP code", { placeholder: "78704", inputMode: "numeric" })}
      </div>

      {field("unit_count", "Number of units", {
        type: "number",
        min: 1,
        placeholder: "24",
      })}

      {state.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          href="/properties"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
