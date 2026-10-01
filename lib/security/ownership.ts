import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Does the caller's organization actually own this thing?
 *
 * Row-level security checks a new row's OWN org_id. It does not check
 * that a property_id sitting beside it belongs to the same organization,
 * and five actions used to insert a request-supplied property_id without
 * looking: adding a variance, creating a board link, and attaching a
 * demo, vendor or manual controller. Any signed-in user could therefore
 * write a row of their own that pointed at somebody else's property --
 * which, read back by the service-role nightly job, applied a forged
 * variance to a stranger's portfolio or exposed it through a public
 * board link.
 *
 * Migration 0029 makes that impossible in the database with composite
 * foreign keys. These helpers exist so the application refuses first and
 * says something useful, rather than surfacing a constraint violation --
 * and so the check is one obvious call that a new action is likely to
 * copy.
 *
 * They must be given an RLS-scoped client, never the service-role one:
 * the whole mechanism is that an unreadable row reads as absent.
 */

/** True when this property is readable by the caller, i.e. theirs. */
export async function ownsProperty(
  supabase: SupabaseClient,
  propertyId: string
): Promise<boolean> {
  if (!propertyId) return false;
  const { data } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();
  return data !== null;
}

/** True when this controller is readable by the caller, i.e. theirs. */
export async function ownsController(
  supabase: SupabaseClient,
  controllerId: string
): Promise<boolean> {
  if (!controllerId) return false;
  const { data } = await supabase
    .from("controllers")
    .select("id")
    .eq("id", controllerId)
    .maybeSingle();
  return data !== null;
}

/**
 * The message shown when it is not theirs.
 *
 * Deliberately the same wording as a property that does not exist. An
 * attacker probing ids should not be able to tell "not yours" from "no
 * such thing", since that difference maps other customers' portfolios.
 */
export const NOT_YOURS =
  "That property could not be found in your portfolio.";

export const CONTROLLER_NOT_YOURS =
  "That controller could not be found in your portfolio.";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Is this the shape of an id Driplin issues?
 *
 * Used before an id is interpolated into a redirect path. A value like
 * "../..//example.com" would otherwise normalise to a protocol-relative
 * URL and send the person off-site, which is a phishing primitive rather
 * than a data leak -- cheap to close, so closed.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
