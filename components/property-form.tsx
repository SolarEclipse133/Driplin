"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PropertyFormState } from "@/app/(app)/properties/actions";
import { JURISDICTIONS } from "@/lib/jurisdictions";

type PropertyValues = {
  name: string;
  street_number: string;
  street_name: string;
  city: string;
  zip: string;
  unit_count: number | "";
  jurisdiction: string;
  property_class: string;
  irrigation_type: string;
  no_street_address: boolean;
};

const EMPTY: PropertyValues = {
  name: "",
  street_number: "",
  street_name: "",
  city: "Austin",
  zip: "",
  unit_count: "",
  jurisdiction: "austin",
  property_class: "commercial",
  irrigation_type: "automatic",
  no_street_address: false,
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

  // Only the text and number fields go through this helper; the
  // no-address checkbox is rendered on its own above.
  const field = (
    name: Exclude<keyof PropertyValues, "no_street_address">,
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
        {values.no_street_address ? (
          <div>
            <label className="block text-sm font-medium text-slate-400">
              Street number
            </label>
            <div className="mt-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              No street address
            </div>
          </div>
        ) : (
          field("street_number", "Street number", { placeholder: "1204" })
        )}
        {field(
          "street_name",
          values.no_street_address ? "Where it is" : "Street name",
          {
            placeholder: values.no_street_address
              ? "Oak Ridge Blvd median, 1st to 3rd"
              : "W Oltorf St",
          }
        )}
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

      <div>
        <label htmlFor="jurisdiction" className="block text-sm font-medium">
          Watering rules apply from
        </label>
        <select
          id="jurisdiction"
          name="jurisdiction"
          value={values.jurisdiction}
          onChange={(e) =>
            setValues((v) => ({ ...v, jurisdiction: e.target.value }))
          }
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {JURISDICTIONS.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} — {j.utility}
            </option>
          ))}
        </select>
        {state.fieldErrors.jurisdiction && (
          <p className="mt-1 text-sm text-red-700">
            {state.fieldErrors.jurisdiction}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          The utility whose drought restrictions this property must follow.
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="no_street_address"
            checked={values.no_street_address}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                no_street_address: e.target.checked,
                street_number: e.target.checked ? "" : v.street_number,
              }))
            }
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
          />
          <span>
            <span className="font-medium">
              This meter has no street address
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              A median, a neighborhood entryway, a greenbelt strip. Check the
              water bill first — most irrigation meters are given a service
              address, and that is the one the city uses to set the watering
              day.
            </span>
          </span>
        </label>
        {values.no_street_address && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Watering days for these areas are set by city rule, not by an
            address digit. San Antonio waters them on Wednesday. The other
            five cities publish no rule, so Driplin will flag this property
            for you to confirm with the utility rather than guess a day.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="property_class" className="block text-sm font-medium">
          Water account type
        </label>
        <select
          id="property_class"
          name="property_class"
          value={values.property_class}
          onChange={(e) =>
            setValues((v) => ({ ...v, property_class: e.target.value }))
          }
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="commercial">
            Commercial or multifamily — HOA common area, apartments, offices
          </option>
          <option value="residential">Single-family residential</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Austin and Leander assign <strong>different watering days</strong> to
          commercial and multifamily accounts. Match this to how the water bill
          for this meter is classified — if you are unsure, check the bill.
        </p>
      </div>

      <div>
        <label htmlFor="irrigation_type" className="block text-sm font-medium">
          Irrigation on this meter
        </label>
        <select
          id="irrigation_type"
          name="irrigation_type"
          value={values.irrigation_type}
          onChange={(e) =>
            setValues((v) => ({ ...v, irrigation_type: e.target.value }))
          }
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="automatic">Automatic in-ground system</option>
          <option value="drip_or_hose">Drip or hose-end sprinklers only</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Austin allows drip and hose-end watering on more days than automatic
          systems.
        </p>
      </div>

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
