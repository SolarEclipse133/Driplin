/**
 * What a new account still has to do before Driplin does anything.
 *
 * Signing up produced an empty dashboard and one sentence: "No properties
 * yet. Add your first property." That is the whole of the onboarding, and
 * it leaves out everything a person actually needs to know -- that a
 * property on its own does nothing, that the controller is the part that
 * makes it work, and that checks run overnight so nothing will happen in
 * the next five minutes.
 *
 * The last point is the one that loses people. Somebody adds a property,
 * sees no verdict, and concludes the product is broken. It is not: it is
 * waiting for tonight, and nobody told them.
 */

export interface SetupState {
  propertyCount: number;
  /** Properties with a controller Driplin can currently read. */
  monitoredCount: number;
  /** Has any controller ever been checked? */
  everChecked: boolean;
}

export interface SetupStep {
  id: "property" | "controller" | "check";
  title: string;
  detail: string;
  done: boolean;
  /** The one to do next. Nothing is "current" once setup is complete. */
  current: boolean;
  /** Where to go, or null when it is not the customer's move. */
  href: string | null;
  action: string | null;
}

export interface SetupProgress {
  steps: SetupStep[];
  complete: boolean;
  /** 0-3, for a progress line. */
  doneCount: number;
}

export function setupProgress(state: SetupState): SetupProgress {
  const hasProperty = state.propertyCount > 0;
  const hasController = state.monitoredCount > 0;
  const checked = state.everChecked;

  const steps: Omit<SetupStep, "current">[] = [
    {
      id: "property",
      title: "Add a property",
      detail: hasProperty
        ? `${state.propertyCount} ${state.propertyCount === 1 ? "property" : "properties"} added.`
        : // The street number is not an administrative detail here: most
          // cities assign the watering day from its last digit.
          "Driplin needs the street number — most cities set the watering day from its last digit. Managing a portfolio? Import the lot from a spreadsheet instead of typing them in.",
      done: hasProperty,
      href: "/properties/new",
      action: "Add a property",
    },
    {
      id: "controller",
      title: "Connect a controller, or say what an old timer is set to",
      detail: hasController
        ? `${state.monitoredCount} ${state.monitoredCount === 1 ? "property is" : "properties are"} being watched.`
        : "This is the part that makes Driplin work. Connect a Rachio or Hydrawise account, or — for the box on the wall with a dial — just tell Driplin what it is set to. Either way it can judge the schedule and say what to change.",
      done: hasController,
      href: hasProperty ? "/properties" : null,
      action: hasProperty ? "Open a property" : null,
    },
    {
      id: "check",
      title: "Driplin checks it overnight",
      // Deliberately not an action. Saying "nothing to do" is the whole
      // point: otherwise an empty verdict reads as a broken product.
      detail: checked
        ? "Done — Driplin is checking every night and will tell you when something changes."
        : "Nothing to do here. The first check runs tonight, and you will hear from Driplin only if something needs attention or the city changes the rules.",
      done: checked,
      href: null,
      action: null,
    },
  ];

  const firstUndone = steps.findIndex((s) => !s.done);

  return {
    steps: steps.map((s, i) => ({ ...s, current: i === firstUndone })),
    complete: firstUndone === -1,
    doneCount: steps.filter((s) => s.done).length,
  };
}
