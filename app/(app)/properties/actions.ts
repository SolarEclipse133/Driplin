"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidStreetNumber } from "@/lib/rules/address";

export type PropertyFormState = {
  error: string | null;
  fieldErrors: Record<string, string>;
};

const OK: PropertyFormState = { error: null, fieldErrors: {} };

function parseAndValidate(formData: FormData) {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    street_number: String(formData.get("street_number") ?? "").trim(),
    street_name: String(formData.get("street_name") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    zip: String(formData.get("zip") ?? "").trim(),
    unit_count: Number(formData.get("unit_count")),
  };

  const fieldErrors: Record<string, string> = {};
  if (!values.name) fieldErrors.name = "Please enter a property name.";
  if (!isValidStreetNumber(values.street_number))
    fieldErrors.street_number =
      "Enter the street number, e.g. 1204 or 1204B (digits, optional letter).";
  if (!values.street_name)
    fieldErrors.street_name = "Please enter the street name.";
  if (!values.city) fieldErrors.city = "Please enter the city.";
  if (!/^[0-9]{5}$/.test(values.zip))
    fieldErrors.zip = "ZIP code must be 5 digits.";
  if (!Number.isInteger(values.unit_count) || values.unit_count < 1)
    fieldErrors.unit_count = "Unit count must be a whole number of 1 or more.";

  return { values, fieldErrors };
}

export async function createProperty(
  _prev: PropertyFormState,
  formData: FormData
): Promise<PropertyFormState> {
  const { values, fieldErrors } = parseAndValidate(formData);
  if (Object.keys(fieldErrors).length > 0) return { error: null, fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...OK, error: "You are no longer signed in." };

  // Look up the caller's organization; the row-level security policy also
  // rejects inserts for any other org, this just supplies the value.
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return { ...OK, error: "Your account has no organization." };

  const { error } = await supabase
    .from("properties")
    .insert({ ...values, org_id: profile.org_id });
  if (error) return { ...OK, error: `Could not save property: ${error.message}` };

  revalidatePath("/properties");
  redirect("/properties");
}

export async function updateProperty(
  propertyId: string,
  _prev: PropertyFormState,
  formData: FormData
): Promise<PropertyFormState> {
  const { values, fieldErrors } = parseAndValidate(formData);
  if (Object.keys(fieldErrors).length > 0) return { error: null, fieldErrors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...OK, error: "You are no longer signed in." };

  // RLS guarantees this can only touch rows in the caller's own org.
  const { data, error } = await supabase
    .from("properties")
    .update(values)
    .eq("id", propertyId)
    .select("id");
  if (error) return { ...OK, error: `Could not save changes: ${error.message}` };
  if (!data || data.length === 0)
    return { ...OK, error: "Property not found." };

  revalidatePath("/properties");
  redirect("/properties");
}

export async function deleteProperty(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("property_id") ?? "");
  if (!propertyId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // RLS guarantees org scoping here as well.
  await supabase.from("properties").delete().eq("id", propertyId);

  revalidatePath("/properties");
  redirect("/properties");
}
