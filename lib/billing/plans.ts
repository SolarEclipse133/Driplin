/**
 * What each plan allows.
 *
 * Prices are deliberately absent. Nobody has been asked to pay yet, so
 * a number here would be a guess wearing the costume of a decision.
 * What IS decided is the shape: per property, because value scales
 * with the number of controllers watched and so does the cost of
 * watching them. Per-seat would penalise adding the colleague who
 * should be receiving the alerts.
 */

export type PlanId = "pilot" | "standard" | "portfolio";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled";

export interface Plan {
  id: PlanId;
  name: string;
  /** Null means no limit. */
  propertyLimit: number | null;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  pilot: {
    id: "pilot",
    name: "Pilot",
    propertyLimit: 3,
    blurb:
      "Free while you try it. Enough properties to take a board report to an actual board meeting.",
  },
  standard: {
    id: "standard",
    name: "Standard",
    propertyLimit: 25,
    blurb:
      "Monitoring, automatic correction, alerts, vendor work orders and board reports across a portfolio.",
  },
  portfolio: {
    id: "portfolio",
    name: "Portfolio",
    propertyLimit: null,
    blurb:
      "For management companies past 25 properties. Adds response-time benchmarking across the whole book.",
  },
};

export const PLAN_IDS: PlanId[] = ["pilot", "standard", "portfolio"];

export function planFor(id: string | null | undefined): Plan {
  return PLANS[(id ?? "pilot") as PlanId] ?? PLANS.pilot;
}

/** Statuses that permit taking on more properties. */
const CAN_GROW: SubscriptionStatus[] = ["trialing", "active"];

export interface Entitlements {
  plan: Plan;
  status: SubscriptionStatus;
  propertyCount: number;
  propertyLimit: number | null;
  /** May this organization add another property right now? */
  canAddProperty: boolean;
  /** Why not, in words a customer can act on. Null when they can. */
  blockedReason: string | null;
  /** Days until the trial ends; null when not trialing. */
  trialDaysLeft: number | null;
  trialExpired: boolean;
  atLimit: boolean;
}

/**
 * Pure. Given a subscription row and a property count, what can this
 * organization do?
 *
 * Note what is NOT computed here: anything that would stop monitoring.
 * An expired trial or an unpaid invoice blocks GROWTH. Properties
 * already being watched stay watched, because the person harmed by
 * switching that off is the homeowner, not the account holder.
 */
export function entitlementsFor(
  subscription: {
    plan?: string | null;
    status?: string | null;
    property_limit?: number | null;
    trial_ends_at?: string | null;
  } | null,
  propertyCount: number,
  now: number = Date.now()
): Entitlements {
  const plan = planFor(subscription?.plan);
  const status = (subscription?.status ?? "trialing") as SubscriptionStatus;

  // The row's own limit wins, so a single account can be given extra
  // room without inventing a new plan for them.
  const propertyLimit =
    subscription?.property_limit !== undefined &&
    subscription?.property_limit !== null
      ? subscription.property_limit
      : plan.propertyLimit;

  const trialEnds = subscription?.trial_ends_at
    ? Date.parse(subscription.trial_ends_at)
    : null;
  const trialDaysLeft =
    status === "trialing" && trialEnds !== null
      ? Math.ceil((trialEnds - now) / 86_400_000)
      : null;
  const trialExpired =
    status === "trialing" && trialEnds !== null && trialEnds <= now;

  const atLimit = propertyLimit !== null && propertyCount >= propertyLimit;

  let blockedReason: string | null = null;
  if (trialExpired) {
    blockedReason =
      "Your pilot has ended. Existing properties are still being monitored — get in touch to continue adding more.";
  } else if (!CAN_GROW.includes(status)) {
    blockedReason =
      status === "past_due"
        ? "There's an unpaid invoice on this account. Everything already set up is still being monitored."
        : "This subscription has ended. Everything already set up is still being monitored.";
  } else if (atLimit) {
    blockedReason = `The ${plan.name} plan covers ${propertyLimit} ${propertyLimit === 1 ? "property" : "properties"}. Move up a plan to add more.`;
  }

  return {
    plan,
    status,
    propertyCount,
    propertyLimit,
    canAddProperty: blockedReason === null,
    blockedReason,
    trialDaysLeft,
    trialExpired,
    atLimit,
  };
}
