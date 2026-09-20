"use client";

import { useActionState } from "react";
import type { VendorFormState } from "@/app/(app)/vendors/actions";

export function VendorForm({
  action,
}: {
  action: (prev: VendorFormState, formData: FormData) => Promise<VendorFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    success: null,
    fieldErrors: {},
  });

  const field = (
    name: string,
    label: string,
    placeholder: string,
    type = "text"
  ) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {state.fieldErrors[name] && (
        <p className="mt-1 text-sm text-red-700">{state.fieldErrors[name]}</p>
      )}
    </div>
  );

  return (
    <form action={formAction} className="max-w-lg space-y-4" noValidate>
      {field("name", "Company name", "Hill Country Landscaping")}
      {field("contact_name", "Contact person (optional)", "Maria Delgado")}
      {field("email", "Email", "crew@hillcountrylandscaping.com", "email")}
      {field("phone", "Phone (optional)", "(512) 555-1234", "tel")}

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Add vendor"}
      </button>
    </form>
  );
}
