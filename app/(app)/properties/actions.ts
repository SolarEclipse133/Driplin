"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidStreetNumber } from "@/lib/rules/address";
import { JURISDICTIONS, jurisdictionForCity } from "@/lib/jurisdictions";

export type PropertyFormState = {
  error: string | null;
  fieldErrors: Record<string, string>;
};

const OK: PropertyFormState = { error: null, fieldErrors: {} };

function parseAndValidate(formData: FormData) {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    // A median or entryway has no street number at all. Storing null
    // is the honest representation; inventing one would produce a
    // confident wrong watering day.
    no_street_address: formData.get("no_street_address") === "on",
    street_number: String(formData.get("street_number") ?? "").trim(),
    street_name: String(formData.get("street_name") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    zip: String(formData.get("zip") ?? "").trim(),
    unit_count: Number(formData.get("unit_count")),
    jurisdiction: String(formData.get("jurisdiction") ?? "").trim(),
    // Which published watering table applies. Austin and Leander assign
    // commercial and multifamily accounts different days from
    // residential ones, so a wrong value here means a wrong day.
    property_class: String(formData.get("property_class") ?? "commercial").trim(),
    irrigation_type: String(formData.get("irrigation_type") ?? "automatic").trim(),
  };

  // Blank selection means "work it out from the city name".
  if (!values.jurisdiction) {
    values.jurisdiction =
      jurisdictionForCity(values.city)?.id ?? "austin";
  }

  const fieldErrors: Record<string, string> = {};
  if (!values.name) fieldErrors.name = "Please enter a property name.";
  if (!values.no_street_address && !isValidStreetNumber(values.street_number))
    fieldErrors.street_number =
      "Enter the street number, e.g. 1204 or 1204B (digits, optional letter). If this meter has no address, tick the box below.";
  if (!values.street_name)
    fieldErrors.street_name = "Please enter the street name.";
  if (!values.city) fieldErrors.city = "Please enter the city.";
  if (!/^[0-9]{5}$/.test(values.zip))
    fieldErrors.zip = "ZIP code must be 5 digits.";
  if (!Number.isInteger(values.unit_count) || values.unit_count < 1)
    fieldErrors.unit_count = "Unit count must be a whole number of 1 or more.";
  if (!JURISDICTIONS.some((j) => j.id === values.jurisdiction))
    fieldErrors.jurisdiction =
      "Pick the city whose watering rules apply to this property.";
  if (!["residential", "commercial"].includes(values.property_class))
    fieldErrors.property_class = "Pick the water account type.";
  if (!["automatic", "drip_or_hose"].includes(values.irrigation_type))
    fieldErrors.irrigation_type = "Pick the irrigation type on this meter.";

  // The database requires exactly one of the two: a street number, or
  // the no-address flag. A blank string is neither, so normalize it.
  const row = {
    ...values,
    street_number: values.no_street_address ? null : values.street_number,
  };

  return { values: row, fieldErrors };
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
