/**
 * Telling a customer their city changed the rules.
 *
 * This is the highest-stakes event in the whole domain: a city moves to
 * Stage 2 and the legal watering days for every property in it can change
 * at once. Driplin knew immediately, and told nobody. Customers found out
 * indirectly and late -- the nightly job ran up to a day later and emitted
 * a scatter of individual violation alerts, with nothing anywhere saying
 * why everything went red on the same night.
 *
 * One message, naming the cause, saying what Driplin already fixed and
 * what still needs a person. Sent even when nothing needs attention:
 * "the city moved and all twelve of your properties already comply" is
 * worth saying out loud, and this happens a few times a year, not nightly.
 */

export interface StageChangeOutcome {
  propertyName: string;
  controllerName: string;
  outcome: "corrected" | "needs_manual_fix" | "unreadable" | "uncertified";
  instructions: string[];
}

export interface StageChangeDigest {
  subject: string;
  body: string;
  severity: "info" | "warning" | "critical";
  needsPersonCount: number;
}

export function buildStageChangeDigest(input: {
  utility: string;
  cityName: string;
  stageName: string;
  previousStageName: string | null;
  sourceLink: string;
  /** Properties this organization has in that city. */
  propertyCount: number;
  affected: StageChangeOutcome[];
}): StageChangeDigest {
  const {
    utility,
    cityName,
    stageName,
    previousStageName,
    sourceLink,
    propertyCount,
    affected,
  } = input;

  const corrected = affected.filter((a) => a.outcome === "corrected");
  const needsPerson = affected.filter((a) => a.outcome === "needs_manual_fix");
  const cannotJudge = affected.filter(
    (a) => a.outcome === "unreadable" || a.outcome === "uncertified"
  );

  const lines: string[] = [];

  lines.push(
    previousStageName
      ? `${utility} has moved ${cityName} from ${previousStageName} to ${stageName}.`
      : `${utility} has confirmed ${stageName} for ${cityName}.`
  );
  lines.push("");
  lines.push(
    `Driplin re-checked your ${propertyCount} ${cityName} propert${propertyCount === 1 ? "y" : "ies"} against the new rules straight away, rather than waiting for tonight.`
  );
  lines.push("");

  if (needsPerson.length > 0) {
    // First, and in full: these are watering illegally right now. What
    // Driplin already fixed goes last -- it is reassurance, and
    // reassurance above an urgent list is how the urgent list gets
    // skimmed past.
    lines.push(
      `NEEDS SOMEONE (${needsPerson.length}) — these cannot be changed remotely and are outside the new rules until someone adjusts them:`
    );
    for (const a of needsPerson) {
      lines.push(`  • ${a.propertyName} (${a.controllerName})`);
      for (const step of a.instructions) lines.push(`      ${step}`);
    }
    lines.push("");
  }

  if (cannotJudge.length > 0) {
    lines.push(
      `Driplin could not judge (${cannotJudge.length}) — it is making no claim about these:`
    );
    for (const a of cannotJudge) {
      lines.push(`  • ${a.propertyName} (${a.controllerName})`);
    }
    lines.push("");
  }

  if (corrected.length > 0) {
    lines.push(
      `Already corrected automatically (${corrected.length}) — nothing for you to do:`
    );
    for (const a of corrected) {
      lines.push(`  • ${a.propertyName} (${a.controllerName})`);
    }
    lines.push("");
  }

  if (affected.length === 0) {
    lines.push(
      propertyCount === 0
        ? "You have no properties in this city, so nothing changes for you."
        : "Every one of them already complies with the new rules. Nothing needs changing."
    );
    lines.push("");
  }

  lines.push(`${utility}'s notice: ${sourceLink}`);

  return {
    subject:
      needsPerson.length > 0
        ? `Action needed: ${cityName} is now ${stageName} (${needsPerson.length} propert${needsPerson.length === 1 ? "y" : "ies"})`
        : `${cityName} is now ${stageName} — your properties are covered`,
    body: lines.join("\n"),
    // A property watering illegally right now is critical. Everything
    // else is news, not an emergency, and should not be dressed as one.
    severity:
      needsPerson.length > 0
        ? "critical"
        : cannotJudge.length > 0
          ? "warning"
          : "info",
    needsPersonCount: needsPerson.length,
  };
}
