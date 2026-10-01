/**
 * Which properties is Driplin actually watching?
 *
 * A property can exist in Driplin, sit in the portfolio, count towards
 * the plan, and be monitored in no sense whatever -- because nothing is
 * connected to it. Bulk import made that easy to reach forty at a time.
 *
 * The dashboard used to say "Compliant 0/40", which reads as forty
 * failing properties. That is not what is true. Driplin does not know
 * anything about those forty, and the difference between "failing" and
 * "unknown" is the difference this whole product trades on.
 *
 * So the count is split: what Driplin can judge, and what it cannot --
 * separating the two reasons it cannot, because they need different
 * actions from different people.
 */

export interface PropertyMonitoring {
  id: string;
  name: string;
  /** Does it have a controller Driplin can currently read? */
  controllerCount: number;
  readableControllerCount: number;
}

export interface MonitoringGap {
  total: number;
  /** Has at least one controller Driplin can read. */
  monitored: number;
  /** Nothing connected at all. Someone has to finish setting it up. */
  noController: PropertyMonitoring[];
  /** Connected, but Driplin cannot read any of them any more. */
  lostContact: PropertyMonitoring[];
  /** True when Driplin is watching nothing at all. */
  watchingNothing: boolean;
}

export function monitoringGap(properties: PropertyMonitoring[]): MonitoringGap {
  const noController = properties.filter((p) => p.controllerCount === 0);
  const lostContact = properties.filter(
    (p) => p.controllerCount > 0 && p.readableControllerCount === 0
  );
  const monitored = properties.filter((p) => p.readableControllerCount > 0);

  return {
    total: properties.length,
    monitored: monitored.length,
    noController,
    lostContact,
    // Only when there is something to watch. An account with no
    // properties yet is not a monitoring failure, it is a new account.
    watchingNothing: properties.length > 0 && monitored.length === 0,
  };
}

/**
 * The sentence to put at the top of the dashboard, or none.
 *
 * Returns null when there is nothing to say -- the only honest default,
 * and the one that keeps the banner meaning something when it does appear.
 */
export function describeGap(gap: MonitoringGap): string | null {
  const { noController, lostContact, total } = gap;
  if (noController.length === 0 && lostContact.length === 0) return null;

  const parts: string[] = [];
  if (noController.length > 0) {
    parts.push(
      `${noController.length} ${noController.length === 1 ? "has" : "have"} no controller connected`
    );
  }
  if (lostContact.length > 0) {
    parts.push(
      `${lostContact.length} ${lostContact.length === 1 ? "has a controller" : "have controllers"} Driplin can no longer read`
    );
  }

  const affected = noController.length + lostContact.length;
  const subject =
    affected === total
      ? total === 1
        ? "Your property is not being checked"
        : `None of your ${total} properties are being checked`
      : `${affected} of your ${total} properties are not being checked`;

  return `${subject}: ${parts.join(", and ")}. Driplin is making no compliance claim about ${affected === 1 ? "it" : "them"}.`;
}
