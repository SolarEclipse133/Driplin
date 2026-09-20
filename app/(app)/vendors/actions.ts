"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type VendorFormState = {
  error: string | null;
  success: string | null;
  fieldErrors: Record<string, string>;
};

async function requireOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, orgId: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  return { supabase, orgId: profile?.org_id ?? null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createVendor(
  _prev: VendorFormState,
  formData: FormData
): Promise<VendorFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please enter the company name.";
  if (email && !EMAIL_RE.test(email))
    fieldErrors.email = "That doesn't look like a valid email address.";

  // A vendor with no way to reach them can't be sent a job.
  if (!email && !phoneRaw)
    fieldErrors.email = "Add an email or a phone number so jobs can be sent.";

  let phone: string | null = null;
  if (phoneRaw) {
    const digits = phoneRaw.replace(/[^0-9]/g, "");
    phone =
      digits.length === 10
        ? `+1${digits}`
        : digits.length === 11 && digits.startsWith("1")
          ? `+${digits}`
          : phoneRaw;
  }

  if (Object.keys(fieldErrors).length > 0)
    return { error: null, success: null, fieldErrors };

  const { supabase, orgId } = await requireOrg();
  if (!orgId)
    return { error: "You are no longer signed in.", success: null, fieldErrors: {} };

  const { error } = await supabase.from("vendors").insert({
    org_id: orgId,
    name,
    contact_name: contactName || null,
    email: email || null,
    phone,
  });
  if (error)
    return { error: "Could not save this vendor.", success: null, fieldErrors: {} };

  revalidatePath("/vendors");
  return { error: null, success: `${name} added.`, fieldErrors: {} };
}

export async function deleteVendor(formData: FormData): Promise<void> {
  const vendorId = String(formData.get("vendor_id") ?? "");
  if (!vendorId) return;
  const { supabase, orgId } = await requireOrg();
  if (!orgId) return;
  await supabase.from("vendors").delete().eq("id", vendorId);
  revalidatePath("/vendors");
}

/** Assign or unassign a property to a vendor. */
export async function toggleVendorProperty(formData: FormData): Promise<void> {
  const vendorId = String(formData.get("vendor_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const assigned = String(formData.get("assigned") ?? "") === "true";
  if (!vendorId || !propertyId) return;

  const { supabase, orgId } = await requireOrg();
  if (!orgId) return;

  if (assigned) {
    await supabase
      .from("vendor_properties")
      .delete()
      .eq("vendor_id", vendorId)
      .eq("property_id", propertyId);
  } else {
    await supabase
      .from("vendor_properties")
      .insert({ vendor_id: vendorId, property_id: propertyId, org_id: orgId });
  }
  revalidatePath("/vendors");
  revalidatePath(`/properties/${propertyId}`);
}
