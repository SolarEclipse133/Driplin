import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashWorkOrderToken } from "@/lib/vendors/tokens";

/**
 * Look up a work order from a link token.
 *
 * This is the ONLY place anonymous traffic reaches the database, so it
 * is deliberately narrow:
 *
 *   - the token is hashed and matched against token_hash; the raw
 *     token is never stored, logged, or compared directly
 *   - exactly one work order is returned, with only the fields the
 *     vendor needs — no portfolio, no other properties, no account data
 *   - an expired, cancelled or unknown token is indistinguishable from
 *     the outside: all of them yield null
 *
 * It uses the service-role client because there is no signed-in user to
 * scope by. That is safe here because the query is keyed solely by a
 * hash the caller must already possess; no caller-supplied value ever
 * selects a different row.
 */

export interface VendorWorkOrder {
  id: string;
  status: "open" | "completed" | "cancelled";
  expired: boolean;
  completedAt: string | null;
  controllerId: string | null;
  controllerName: string;
  vendorType: string;
  steps: string[];
  propertyName: string;
  propertyAddress: string;
  vendorName: string;
  orgId: string;
  propertyId: string;
}

export async function findWorkOrderByToken(
  token: string
): Promise<VendorWorkOrder | null> {
  if (!token || token.length < 20) return null;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return null;
  }

  const { data } = await supabase
    .from("work_orders")
    .select(
      "id, org_id, property_id, controller_id, status, instructions, expires_at, completed_at, vendors(name), properties(name, street_number, street_name, city, zip)"
    )
    .eq("token_hash", hashWorkOrderToken(token))
    .maybeSingle();

  if (!data) return null;

  const property = Array.isArray(data.properties)
    ? data.properties[0]
    : data.properties;
  const vendor = Array.isArray(data.vendors) ? data.vendors[0] : data.vendors;
  const instructions = (data.instructions ?? {}) as {
    steps?: string[];
    controllerName?: string;
    vendorType?: string;
  };

  return {
    id: data.id,
    status: data.status,
    expired: new Date(data.expires_at).getTime() < Date.now(),
    completedAt: data.completed_at,
    controllerId: data.controller_id,
    controllerName: instructions.controllerName ?? "the irrigation controller",
    vendorType: instructions.vendorType ?? "controller",
    steps: instructions.steps ?? [],
    propertyName: property?.name ?? "the property",
    propertyAddress: property
      ? `${property.street_number} ${property.street_name}, ${property.city} ${property.zip}`
      : "",
    vendorName: vendor?.name ?? "",
    orgId: data.org_id,
    propertyId: data.property_id,
  };
}
