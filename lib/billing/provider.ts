import "server-only";
import type { PlanId } from "./plans";

/**
 * The seam where a payment provider will attach.
 *
 * Same shape as the irrigation-vendor and notification-sender
 * abstractions already in this codebase: one interface, one factory,
 * and exactly one place that would ever talk to Stripe. Everything
 * else asks for a checkout link and does not care who provides it.
 *
 * Today there is one implementation, and it is honest about being
 * manual: the first customers are invoiced by hand, which is the right
 * amount of machinery for a product with unvalidated pricing. When
 * Stripe is added, nothing outside this file changes.
 */

export interface CheckoutRequest {
  orgId: string;
  orgName: string;
  plan: PlanId;
  /** Where to send the customer once they are done. */
  returnUrl: string;
}

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "manual"; message: string };

export interface BillingProvider {
  readonly id: "manual" | "stripe";
  /** Start a plan change. */
  startCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Whether self-serve plan changes are possible at all. */
  readonly selfServe: boolean;
}

const MANUAL: BillingProvider = {
  id: "manual",
  selfServe: false,
  async startCheckout() {
    return {
      kind: "manual",
      message:
        "Plan changes are handled by hand while Driplin is in pilot. Email us and we'll move you across the same day.",
    };
  },
};

/**
 * Returns whichever provider is configured. Stripe would be selected
 * here on the presence of its key, exactly as the notification senders
 * switch on RESEND_API_KEY.
 */
export function getBillingProvider(): BillingProvider {
  return MANUAL;
}
