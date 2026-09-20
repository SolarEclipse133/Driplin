"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notifications/senders";
import {
  generateWorkOrderToken,
  hashWorkOrderToken,
  workOrderExpiry,
  workOrderUrl,
  WORK_ORDER_TTL_DAYS,
} from "@/lib/vendors/tokens";

export type WorkOrderState = {
  error: string | null;
  success: string | null;
  /** The one and only time the raw link exists, for copy/paste. */
  link: string | null;
  emailed: boolean;
};

/**
 * Hand a manual fix to a vendor.
 *
 * Generates a single-purpose link, stores only its hash, and gives the
 * manager the raw link once — to copy, and (where email delivery is
 * configured) emailed to the vendor as well.
 */
export async function sendToVendor(
  _prev: WorkOrderState,
  formData: FormData
): Promise<WorkOrderState> {
  const controllerId = String(formData.get("controller_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  const vendorId = String(formData.get("vendor_id") ?? "");
  const fail = (error: string): WorkOrderState => ({
    error,
    success: null,
    link: null,
    emailed: false,
  });

  if (!vendorId) return fail("Pick a vendor to send this to.");
  if (!controllerId || !propertyId) return fail("Missing controller.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You are no longer signed in.");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return fail("Your account has no organization.");

  // Row-level security keeps all three of these inside the caller's org.
  const [{ data: vendor }, { data: property }, { data: controller }] =
    await Promise.all([
      supabase.from("vendors").select("id, name, email").eq("id", vendorId).single(),
      supabase
        .from("properties")
        .select("id, name, street_number, street_name, city, zip")
        .eq("id", propertyId)
        .single(),
      supabase
        .from("controllers")
        .select("id, name, vendor, compliance_detail")
        .eq("id", controllerId)
        .single(),
    ]);
  if (!vendor || !property || !controller)
    return fail("Could not find that vendor, property or controller.");

  const instructions =
    ((controller.compliance_detail as { manualInstructions?: string[] } | null)
      ?.manualInstructions ?? []);

  const token = generateWorkOrderToken();
  const { data: order, error } = await supabase
    .from("work_orders")
    .insert({
      org_id: profile.org_id,
      property_id: propertyId,
      controller_id: controllerId,
      vendor_id: vendorId,
      token_hash: hashWorkOrderToken(token),
      instructions: {
        steps: instructions,
        controllerName: controller.name,
        vendorType: controller.vendor,
      },
      created_by: profile.id,
      expires_at: workOrderExpiry().toISOString(),
    })
    .select("id")
    .single();
  if (error || !order) return fail("Could not create the work order.");

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `https://${(await headers()).get("host") ?? "driplin.vercel.app"}`;
  const link = workOrderUrl(token, origin);

  let emailed = false;
  if (vendor.email) {
    const body = [
      `${profile.full_name || "Your client"} has asked you to update an irrigation controller.`,
      "",
      `Property: ${property.name}`,
      `Address: ${property.street_number} ${property.street_name}, ${property.city} ${property.zip}`,
      `Controller: ${controller.name}`,
      "",
      "What needs changing:",
      ...instructions.map((s, i) => `${i + 1}. ${s}`),
      "",
      `Open this link on your phone to see the details and mark it done:`,
      link,
      "",
      `This link is personal to this job and stops working in ${WORK_ORDER_TTL_DAYS} days. Please don't forward it.`,
      "",
      "— Driplin drought compliance",
    ].join("\n");
    const result = await sendEmail(
      vendor.email,
      `Irrigation update needed at ${property.name}`,
      body
    );
    emailed = result.status === "sent";
  }

  revalidatePath(`/properties/${propertyId}`);
  return {
    error: null,
    success: emailed
      ? `Sent to ${vendor.name} at ${vendor.email}. The link is below if you'd rather text it.`
      : `Work order created for ${vendor.name}. Copy the link below and send it to them — email delivery isn't configured for this address yet.`,
    link,
    emailed,
  };
}

export async function cancelWorkOrder(formData: FormData): Promise<void> {
  const workOrderId = String(formData.get("work_order_id") ?? "");
  const propertyId = String(formData.get("property_id") ?? "");
  if (!workOrderId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("work_orders")
    .update({ status: "cancelled" })
    .eq("id", workOrderId)
    .eq("status", "open");
  revalidatePath(`/properties/${propertyId}`);
}
