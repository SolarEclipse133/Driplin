import { describe, expect, it } from "vitest";
import { recipientsFor, type Member } from "./recipients";

/**
 * Who hears about an alert.
 *
 * The property under test is a safety property: assignment NARROWS the
 * audience and may never EMPTY it. An alert delivered to nobody looks
 * exactly like a property that is fine, and the manager finds out from
 * the city instead.
 */

const ANA: Member = { id: "ana", email: "ana@example.com", phone: "+15125550001" };
const BEN: Member = { id: "ben", email: "ben@example.com", phone: null };
const CAI: Member = { id: "cai", email: null, phone: "+15125550003" };
const GHOST: Member = { id: "ghost", email: null, phone: null };
const TEAM = [ANA, BEN, CAI];

describe("unassigned properties go to the whole team", () => {
  it("emails everyone with an address and texts everyone with a number", () => {
    const r = recipientsFor(TEAM, null);
    expect(r.email).toEqual(["ana@example.com", "ben@example.com"]);
    expect(r.sms).toEqual(["+15125550001", "+15125550003"]);
    expect(r.reason).toBe("whole-team");
  });

  it("treats undefined the same as null", () => {
    expect(recipientsFor(TEAM, undefined).reason).toBe("whole-team");
  });
});

describe("assignment narrows the audience", () => {
  it("sends only to the assigned manager", () => {
    const r = recipientsFor(TEAM, "ana");
    expect(r.email).toEqual(["ana@example.com"]);
    expect(r.sms).toEqual(["+15125550001"]);
    expect(r.reason).toBe("assigned");
  });

  it("uses whichever channels that person actually has", () => {
    const r = recipientsFor(TEAM, "cai");
    expect(r.email).toEqual([]);
    expect(r.sms).toEqual(["+15125550003"]);
    expect(r.reason).toBe("assigned");
  });
});

describe("assignment can never empty the audience", () => {
  it("falls back to the team when the assignee has no contact details", () => {
    const r = recipientsFor([...TEAM, GHOST], "ghost");
    expect(r.email.length + r.sms.length).toBeGreaterThan(0);
    expect(r.reason).toBe("assignee-unreachable");
  });

  it("falls back to the team when the assignee has left", () => {
    const r = recipientsFor(TEAM, "someone-who-left");
    expect(r.email).toEqual(["ana@example.com", "ben@example.com"]);
    expect(r.reason).toBe("assignee-unreachable");
  });

  it("reports honestly when genuinely nobody can be reached", () => {
    const r = recipientsFor([GHOST], "ghost");
    expect(r.email).toEqual([]);
    expect(r.sms).toEqual([]);
    // Not a silent empty list — a named state the caller can log.
    expect(r.reason).toBe("none-reachable");
  });

  it("never returns nobody while anyone on the team is reachable", () => {
    const assignees = [null, undefined, "ana", "ben", "cai", "ghost", "stranger"];
    for (const assignee of assignees) {
      const r = recipientsFor([...TEAM, GHOST], assignee as string | null);
      expect(r.email.length + r.sms.length, `assignee=${assignee}`).toBeGreaterThan(0);
    }
  });
});
