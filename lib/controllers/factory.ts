/**
 * The single place that decides which vendor implementation to use.
 * Everything outside lib/controllers/ gets its IrrigationController or
 * VendorAccountClient from here and never imports a vendor file directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ControllerError,
  ControllerVendor,
  IrrigationController,
  VendorAccountClient,
} from "./types";
import { RachioAccountClient, RachioController } from "./rachio";
import { HydrawiseAccountClient, HydrawiseController } from "./hydrawise";
import { DemoController } from "./demo";

/** The controllers-table row shape the factory needs. */
export interface ControllerRow {
  id: string;
  vendor: ControllerVendor;
  vendor_device_id: string;
  name: string;
}

export function getAccountClient(
  vendor: ControllerVendor,
  apiKey: string
): VendorAccountClient {
  switch (vendor) {
    case "rachio":
      return new RachioAccountClient(apiKey);
    case "hydrawise":
      return new HydrawiseAccountClient(apiKey);
    default:
      throw new ControllerError(`No account client for vendor "${vendor}".`);
  }
}

export function getController(
  row: ControllerRow,
  deps: {
    /** Org's vendor API key; required for rachio/hydrawise. */
    apiKey?: string;
    /** RLS-scoped Supabase client; required for demo controllers. */
    supabase?: SupabaseClient;
  }
): IrrigationController {
  switch (row.vendor) {
    case "rachio":
      if (!deps.apiKey)
        throw new ControllerError("Rachio API key is missing for this org.");
      return new RachioController(deps.apiKey, row.vendor_device_id);
    case "hydrawise":
      return new HydrawiseController();
    case "demo":
      if (!deps.supabase)
        throw new ControllerError("Demo controller needs a database client.");
      return new DemoController(deps.supabase, row.id, row.name);
  }
}
