/**
 * Hunter Hydrawise implementation of the IrrigationController
 * abstraction, using the Hydrawise REST API v1 (available to every
 * account holder): https://api.hydrawise.com/api/v1
 *   - customerdetails.php?api_key=…            → account + controllers[]
 *   - statusschedule.php?api_key=…&controller_id=… → relays (zones)
 *     with their next scheduled run
 *
 * Quirks verified against the live API:
 *   - invalid key   → HTTP 404, body "API key not valid"
 *   - valid key but the account's controller has no serial number
 *     (fresh accounts) → HTTP 403, body "Controller must have a serial
 *     number…" — the key is fine, there's just no usable device yet.
 *
 * Semantic note: Hydrawise exposes each zone's NEXT scheduled run, not
 * the underlying weekly program definition. We map each zone's next run
 * to a program entry (day + start time + duration), which is exactly
 * what compliance needs to judge: is the next watering on an allowed
 * day at an allowed time? Rewriting schedules remotely is not supported
 * by this API, so corrections route to the manual-fallback flow.
 */

import {
  AvailableDevice,
  ControllerError,
  ControllerInfo,
  ControllerSchedule,
  IrrigationController,
  ScheduleProgram,
  ScheduleWriteNotSupportedError,
  VendorAccountClient,
  Weekday,
} from "./types";

const BASE = "https://api.hydrawise.com/api/v1";
const NO_SERIAL_MARKER = "serial number";

const WEEKDAY_BY_JS_DAY: Weekday[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

/** Suspended zones report a next-run absurdly far in the future. */
const SUSPENDED_THRESHOLD_SECONDS = 365 * 24 * 3600;

async function hydrawiseFetch(
  apiKey: string,
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const qs = new URLSearchParams({ api_key: apiKey, ...params });
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}?${qs}`, { cache: "no-store" });
  } catch {
    throw new ControllerError("Could not reach Hydrawise (network error).");
  }

  const text = await res.text();
  if (!res.ok) {
    if (text.includes("API key not valid")) {
      throw new ControllerError("Hydrawise rejected the API key.");
    }
    if (text.toLowerCase().includes(NO_SERIAL_MARKER)) {
      // Valid key, but no physical controller attached to the account.
      throw new NoUsableControllerError();
    }
    throw new ControllerError(
      `Hydrawise returned an error (HTTP ${res.status}).`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ControllerError("Hydrawise returned an unexpected response.");
  }
}

class NoUsableControllerError extends ControllerError {
  constructor() {
    super(
      "The Hydrawise account is connected but has no controller with a serial number attached yet."
    );
    this.name = "NoUsableControllerError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Map one Hydrawise relay (zone) to our vendor-neutral program shape. */
function mapRelay(relay: any, now: Date): ScheduleProgram {
  const secondsUntilRun =
    typeof relay.time === "number" ? relay.time : Number.MAX_SAFE_INTEGER;
  const durationSeconds = typeof relay.run === "number" ? relay.run : 0;
  const suspended = secondsUntilRun >= SUSPENDED_THRESHOLD_SECONDS;

  let days: Weekday[] = [];
  let startTime = "00:00";
  if (!suspended && Number.isFinite(secondsUntilRun)) {
    const runAt = new Date(now.getTime() + secondsUntilRun * 1000);
    // Times in Central Texas local time, matching the rules engine.
    const local = new Date(
      runAt.toLocaleString("en-US", { timeZone: "America/Chicago" })
    );
    days = [WEEKDAY_BY_JS_DAY[local.getDay()]];
    startTime = `${String(local.getHours()).padStart(2, "0")}:${String(
      local.getMinutes()
    ).padStart(2, "0")}`;
  }

  return {
    vendorProgramId: String(relay.relay_id ?? relay.relay ?? ""),
    name: String(relay.name ?? "Zone"),
    enabled: !suspended,
    days,
    startTime,
    durationMinutes: Math.round(durationSeconds / 60),
  };
}

export class HydrawiseAccountClient implements VendorAccountClient {
  readonly vendor = "hydrawise" as const;

  constructor(private apiKey: string) {}

  async validateKey(): Promise<string> {
    try {
      const details = (await hydrawiseFetch(
        this.apiKey,
        "customerdetails.php"
      )) as any;
      return String(details?.customer_id ? `Hydrawise customer ${details.customer_id}` : "Hydrawise account");
    } catch (err) {
      if (err instanceof NoUsableControllerError) {
        // Key works; the account just has no device yet.
        return "Hydrawise account (no controllers attached yet)";
      }
      throw err;
    }
  }

  async listDevices(): Promise<AvailableDevice[]> {
    let details: any;
    try {
      details = await hydrawiseFetch(this.apiKey, "customerdetails.php");
    } catch (err) {
      if (err instanceof NoUsableControllerError) return [];
      throw err;
    }
    const controllers: any[] = Array.isArray(details?.controllers)
      ? details.controllers
      : [];
    return controllers.map((c) => ({
      vendorDeviceId: String(c.controller_id),
      name: String(c.name ?? "Hydrawise controller"),
    }));
  }
}

export class HydrawiseController implements IrrigationController {
  readonly vendor = "hydrawise" as const;

  constructor(
    private apiKey: string,
    private controllerId: string,
    private controllerName: string
  ) {}

  async getStatus(): Promise<ControllerInfo> {
    // A successful schedule fetch is the online check for this API.
    await hydrawiseFetch(this.apiKey, "statusschedule.php", {
      controller_id: this.controllerId,
    });
    return {
      vendorDeviceId: this.controllerId,
      name: this.controllerName,
      online: true,
    };
  }

  async getSchedule(): Promise<ControllerSchedule> {
    const status = (await hydrawiseFetch(this.apiKey, "statusschedule.php", {
      controller_id: this.controllerId,
    })) as any;
    const relays: any[] = Array.isArray(status?.relays) ? status.relays : [];
    const now = new Date();
    return { programs: relays.map((r) => mapRelay(r, now)) };
  }

  async setSchedule(_programs: ScheduleProgram[]): Promise<void> {
    // The v1 API can run/stop/suspend zones but cannot rewrite a
    // program's watering days or times — corrections go through the
    // manual-fallback flow. (Zone suspension as a stopgap enforcement
    // tool is a possible future enhancement.)
    throw new ScheduleWriteNotSupportedError(
      "hydrawise",
      "schedule days/times must be changed in the Hydrawise app"
    );
  }
}
