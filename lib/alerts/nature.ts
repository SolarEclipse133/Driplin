import type { AlertType } from "@/lib/notifications/dispatch";

/**
 * Telling "something needs you" apart from "something happened".
 *
 * Every alert shared one bucket and one lifecycle, and nothing ever closed
 * one. So a four-property test account accumulated seventeen open alerts in
 * thirteen days -- twelve of them saying "schedule was out of compliance
 * and has been corrected automatically", which is news about something
 * already fixed, filed permanently under "unacknowledged".
 *
 * At forty properties that is thousands a year, all open forever, and the
 * count on the dashboard means nothing within a month. Which defeats the
 * one thing this product depends on: that when Driplin says something, it
 * matters.
 *
 * So each kind is either a TASK -- a person has to do something, it stays
 * until they do or until it fixes itself -- or ACTIVITY, which is a record
 * that belongs in the log rather than a queue.
 */

export type AlertNature = "task" | "activity";

/**
 * Severity matters as well as type. A stage change with nothing to do is
 * news; the same change leaving properties outside the rules is a task.
 */
export function alertNature(
  type: string,
  severity: "info" | "warning" | "critical"
): AlertNature {
  switch (type as AlertType) {
    // Driplin already fixed it. Worth recording, never worth chasing.
    case "violation":
      return severity === "info" ? "activity" : "task";

    // Someone has to touch hardware, a vendor connection, or a utility.
    case "push_failed":
    case "controller_unreadable":
    case "variance_expiring":
    case "work_order_stale":
      return "task";

    // News unless it left something outside the rules, which is how the
    // digest sets its severity.
    case "stage_change":
      return severity === "critical" ? "task" : "activity";

    // Driplin's own operations, not a customer's.
    case "lcra_threshold":
    case "early_warning":
      return "task";

    default:
      // An unknown kind is treated as a task: being wrongly chased is
      // recoverable, being wrongly ignored is what this exists to prevent.
      return "task";
  }
}

/**
 * Which open tasks are no longer true, given where a controller now stands.
 *
 * Driplin closing its own alerts is the point. Expecting someone to tidy up
 * after a problem that fixed itself is how a queue becomes wallpaper.
 */
export interface ControllerOutcome {
  /** null when Driplin cannot currently judge it. */
  compliant: boolean | null;
  /** Can Driplin read the controller at all? */
  readable: boolean;
}

export function resolvableTypes(outcome: ControllerOutcome): AlertType[] {
  const types: AlertType[] = [];

  // Reading it again settles the one about not being able to.
  if (outcome.readable) types.push("controller_unreadable");

  // Compliant again settles everything that was about it not being so --
  // including a work order, because the work is evidently done whether or
  // not anyone marked it.
  if (outcome.compliant === true) {
    types.push("push_failed", "violation", "work_order_stale");
  }

  return types;
}
