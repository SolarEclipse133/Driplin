/**
 * Chasing a work order nobody acted on.
 *
 * Driplin found the problem, handed it to a landscaper, and then quietly
 * hoped. A work order sat at status 'open' forever: the vendor never
 * opened the link, or opened it and did nothing, and the property kept
 * watering illegally while the manager assumed it had been dealt with.
 *
 * The product's claim is that nothing silently stays broken. Handing a
 * task to someone else and never checking is the same silence, one step
 * removed.
 *
 * The judgement in here is entirely about restraint. An alert that
 * arrives daily for a fortnight gets filtered, and then the real one is
 * filtered with it. So: give the vendor a working week's grace, chase
 * once, escalate once, and after that no more often than weekly.
 */

/** Landscapers work in weekly cycles. Chasing after a day is noise. */
export const FIRST_CHASE_DAYS = 3;
/** A week of illegal watering is no longer a scheduling slip. */
export const ESCALATE_DAYS = 7;
/** Never more often than this, however long it drags on. */
export const REPEAT_EVERY_DAYS = 7;

export interface OpenWorkOrder {
  id: string;
  propertyName: string;
  vendorName: string | null;
  createdAt: string;
  /** When the vendor's link stops working. */
  expiresAt: string;
  /** Is the property STILL not compliant? The only reason to chase. */
  stillNonCompliant: boolean;
  /** When Driplin last chased this order, if ever. */
  lastChasedAt: string | null;
}

export type ChaseDecision =
  | { chase: false; reason: string }
  | {
      chase: true;
      severity: "warning" | "critical";
      /** True when the vendor's link has lapsed and must be re-sent. */
      linkExpired: boolean;
      ageDays: number;
      message: string;
    };

const DAY_MS = 86_400_000;

function ageInDays(iso: string, now: number): number {
  return Math.floor((now - Date.parse(iso)) / DAY_MS);
}

/**
 * Should Driplin chase this work order right now, and how loudly?
 */
export function decideChase(
  order: OpenWorkOrder,
  now: number = Date.now()
): ChaseDecision {
  // The only reason to chase is that the property is still in breach.
  // If the schedule is right again, the work got done -- whether or not
  // anyone remembered to mark it. Driplin is not a to-do list.
  if (!order.stillNonCompliant) {
    return { chase: false, reason: "the property is compliant again" };
  }

  const ageDays = ageInDays(order.createdAt, now);
  const linkExpired = Date.parse(order.expiresAt) <= now;

  // An expired link is a worse state than a slow vendor: they cannot
  // act now even if they want to. Worth raising before the usual grace
  // period is up, because nothing can happen until it is re-sent.
  if (!linkExpired && ageDays < FIRST_CHASE_DAYS) {
    return {
      chase: false,
      reason: `sent ${ageDays} day${ageDays === 1 ? "" : "s"} ago; giving the vendor time`,
    };
  }

  // Already chased recently: say nothing. This is the rule that keeps
  // the alerts worth reading.
  if (order.lastChasedAt !== null) {
    const sinceChase = ageInDays(order.lastChasedAt, now);
    if (sinceChase < REPEAT_EVERY_DAYS) {
      return {
        chase: false,
        reason: `already chased ${sinceChase} day${sinceChase === 1 ? "" : "s"} ago`,
      };
    }
  }

  const who = order.vendorName ?? "the vendor";
  const severity: "warning" | "critical" =
    linkExpired || ageDays >= ESCALATE_DAYS ? "critical" : "warning";

  const message = linkExpired
    ? `${order.propertyName} is still not compliant and the work-order link sent to ${who} has expired, so they can no longer act on it. Send a new one or fix the controller directly.`
    : ageDays >= ESCALATE_DAYS
      ? `${order.propertyName} has been watering outside the city's rules for ${ageDays} days. ${who} was sent a work order and has not completed it. This needs someone today.`
      : `${order.propertyName} is still not compliant ${ageDays} days after a work order went to ${who}. Nothing has come back.`;

  return { chase: true, severity, linkExpired, ageDays, message };
}
