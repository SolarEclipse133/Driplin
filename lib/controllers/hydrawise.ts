/**
 * Hunter Hydrawise implementation — STUB.
 *
 * Commercial API access is pending; until the real key exists this
 * vendor cannot be connected (the account client says so clearly).
 * When access is granted, this file gets a real implementation against
 * the Hydrawise REST API and nothing outside lib/controllers/ changes.
 */

import {
  AvailableDevice,
  ControllerError,
  ControllerInfo,
  ControllerSchedule,
  IrrigationController,
  ScheduleProgram,
  VendorAccountClient,
} from "./types";

const NOT_READY =
  "Hydrawise support is coming soon (API access pending approval).";

export class HydrawiseAccountClient implements VendorAccountClient {
  readonly vendor = "hydrawise" as const;

  constructor(_apiKey: string) {}

  async validateKey(): Promise<string> {
    throw new ControllerError(NOT_READY);
  }

  async listDevices(): Promise<AvailableDevice[]> {
    throw new ControllerError(NOT_READY);
  }
}

export class HydrawiseController implements IrrigationController {
  readonly vendor = "hydrawise" as const;

  async getStatus(): Promise<ControllerInfo> {
    throw new ControllerError(NOT_READY);
  }

  async getSchedule(): Promise<ControllerSchedule> {
    throw new ControllerError(NOT_READY);
  }

  async setSchedule(_programs: ScheduleProgram[]): Promise<void> {
    throw new ControllerError(NOT_READY);
  }
}
