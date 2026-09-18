/**
 * The vendor-neutral irrigation controller abstraction.
 *
 * HARD RULE for this codebase: nothing outside lib/controllers/ may talk
 * to a vendor API. The rest of the app only ever sees these types and the
 * factory in factory.ts. Adding or removing a vendor means adding or
 * removing one implementation file plus one factory case — nothing else.
 */

export type ControllerVendor = "rachio" | "hydrawise" | "demo";

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export const WEEKDAYS: Weekday[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

/** One watering program (a.k.a. schedule rule) on a controller. */
export interface ScheduleProgram {
  /** The program's ID in the vendor's system. */
  vendorProgramId: string;
  name: string;
  enabled: boolean;
  days: Weekday[];
  /** Local start time, 24h "HH:MM". */
  startTime: string;
  durationMinutes: number;
}

export interface ControllerSchedule {
  programs: ScheduleProgram[];
}

export interface ControllerInfo {
  vendorDeviceId: string;
  name: string;
  online: boolean;
}

/** A device available on a vendor account, before it's connected. */
export interface AvailableDevice {
  vendorDeviceId: string;
  name: string;
}

/** Thrown for any vendor API failure; message is safe to show users. */
export class ControllerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControllerError";
  }
}

/**
 * Thrown by setSchedule when the vendor's API cannot rewrite schedules
 * remotely. Callers must treat this as "switch to manual-fallback mode":
 * keep the property on the dashboard with instructions for what to
 * change by hand.
 */
export class ScheduleWriteNotSupportedError extends ControllerError {
  constructor(vendor: ControllerVendor, detail: string) {
    super(
      `${vendor} does not allow this schedule change via its API: ${detail}`
    );
    this.name = "ScheduleWriteNotSupportedError";
  }
}

/** Every vendor implementation provides exactly this surface. */
export interface IrrigationController {
  readonly vendor: ControllerVendor;
  getStatus(): Promise<ControllerInfo>;
  getSchedule(): Promise<ControllerSchedule>;
  /**
   * Replace the device's watering programs. Throws
   * ScheduleWriteNotSupportedError when the vendor cannot do this
   * remotely, which triggers the manual-fallback flow.
   */
  setSchedule(programs: ScheduleProgram[]): Promise<void>;
}

/**
 * Account-level operations used by the "connect a controller" flow,
 * before any specific device is linked.
 */
export interface VendorAccountClient {
  readonly vendor: ControllerVendor;
  /** Checks the API key works; returns a human-readable account label. */
  validateKey(): Promise<string>;
  listDevices(): Promise<AvailableDevice[]>;
}
