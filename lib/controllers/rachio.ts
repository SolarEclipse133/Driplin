/**
 * Rachio implementation of the IrrigationController abstraction.
 *
 * Uses Rachio's public v1 API (https://rachio.readme.io):
 *   - GET  /person/info            → the API key's account id
 *   - GET  /person/{id}            → account details incl. devices[]
 *   - GET  /device/{id}            → device details incl. scheduleRules[]
 *
 * IMPORTANT LIMITATION, verified against Rachio's docs: the v1 API can
 * read schedules but cannot rewrite a schedule's days/start time (only
 * skip runs / seasonal-adjust durations). Rachio's newer v2 "program"
 * API (cloud-rest.rach.io, updateProgramV2) can update programs, but is
 * sparsely documented; we attempt it and translate any failure into
 * ScheduleWriteNotSupportedError so the app falls back to manual-fix
 * instructions. This is exercised properly once a real device exists.
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
  WEEKDAYS,
} from "./types";

const V1_BASE = "https://api.rach.io/1/public";

async function rachioFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${V1_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      // Vendor data must never be served stale from Next's fetch cache.
      cache: "no-store",
    });
  } catch {
    throw new ControllerError("Could not reach Rachio (network error).");
  }
  if (res.status === 401 || res.status === 403) {
    throw new ControllerError("Rachio rejected the API key.");
  }
  if (res.status === 429) {
    throw new ControllerError(
      "Rachio's daily API rate limit was hit; try again later."
    );
  }
  if (!res.ok) {
    throw new ControllerError(`Rachio returned an error (HTTP ${res.status}).`);
  }
  return res.json();
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Map one Rachio scheduleRule to our vendor-neutral program shape.
 * Written defensively: Rachio's rule objects vary by schedule type
 * (fixed vs. flex), so unknown shapes degrade gracefully rather than
 * crash — a program with unknown days shows as days: [].
 */
function mapScheduleRule(rule: any): ScheduleProgram {
  const days = new Set<Weekday>();
  const candidates: string[] = [
    ...(Array.isArray(rule.scheduleJobTypes) ? rule.scheduleJobTypes : []),
    ...(Array.isArray(rule.days) ? rule.days : []),
  ];
  for (const raw of candidates) {
    const upper = String(raw).toUpperCase();
    for (const day of WEEKDAYS) {
      if (upper.startsWith(day)) days.add(day);
    }
    // Rachio sometimes uses full names ("MONDAY") — covered by
    // startsWith above — or "WEEKDAY"/"WEEKEND" groups:
    if (upper === "WEEKDAYS")
      ["MON", "TUE", "WED", "THU", "FRI"].forEach((d) =>
        days.add(d as Weekday)
      );
    if (upper === "WEEKENDS") ["SAT", "SUN"].forEach((d) => days.add(d as Weekday));
  }

  const startHour = typeof rule.startHour === "number" ? rule.startHour : 0;
  const startMinute = typeof rule.startMinute === "number" ? rule.startMinute : 0;
  const totalSeconds =
    typeof rule.totalDuration === "number" ? rule.totalDuration : 0;

  return {
    vendorProgramId: String(rule.id ?? ""),
    name: String(rule.name ?? rule.externalName ?? "Unnamed schedule"),
    enabled: rule.enabled !== false,
    days: [...days],
    startTime: `${String(startHour).padStart(2, "0")}:${String(
      startMinute
    ).padStart(2, "0")}`,
    durationMinutes: Math.round(totalSeconds / 60),
  };
}

export class RachioAccountClient implements VendorAccountClient {
  readonly vendor = "rachio" as const;

  constructor(private apiKey: string) {}

  private async personId(): Promise<string> {
    const info = (await rachioFetch(this.apiKey, "/person/info")) as any;
    if (!info?.id) throw new ControllerError("Rachio returned no account id.");
    return String(info.id);
  }

  async validateKey(): Promise<string> {
    const id = await this.personId();
    const person = (await rachioFetch(this.apiKey, `/person/${id}`)) as any;
    return String(person?.username ?? person?.email ?? "Rachio account");
  }

  async listDevices(): Promise<AvailableDevice[]> {
    const id = await this.personId();
    const person = (await rachioFetch(this.apiKey, `/person/${id}`)) as any;
    const devices: any[] = Array.isArray(person?.devices) ? person.devices : [];
    return devices
      .filter((d) => !d.deleted)
      .map((d) => ({
        vendorDeviceId: String(d.id),
        name: String(d.name ?? "Rachio controller"),
      }));
  }
}

export class RachioController implements IrrigationController {
  readonly vendor = "rachio" as const;

  constructor(
    private apiKey: string,
    private deviceId: string
  ) {}

  private async device(): Promise<any> {
    return rachioFetch(this.apiKey, `/device/${this.deviceId}`);
  }

  async getStatus(): Promise<ControllerInfo> {
    const d = await this.device();
    return {
      vendorDeviceId: this.deviceId,
      name: String(d?.name ?? "Rachio controller"),
      online: d?.status === "ONLINE",
    };
  }

  async getSchedule(): Promise<ControllerSchedule> {
    const d = await this.device();
    const rules: any[] = [
      ...(Array.isArray(d?.scheduleRules) ? d.scheduleRules : []),
      ...(Array.isArray(d?.flexScheduleRules) ? d.flexScheduleRules : []),
    ];
    return { programs: rules.map(mapScheduleRule) };
  }

  async setSchedule(_programs: ScheduleProgram[]): Promise<void> {
    // See the file header: v1 cannot rewrite schedules, and the v2
    // program API is unverified until a real device is connected. Until
    // then, surface the manual-fallback path honestly.
    throw new ScheduleWriteNotSupportedError(
      "rachio",
      "schedule days/times must be changed in the Rachio app"
    );
  }
}
