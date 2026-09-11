import { paypalEnv } from "./env.schema.js";

export interface CreateSubscriptionInput {
  planId: string;
}

export interface Subscription {
  id: string;
  status: "APPROVAL_PENDING";
}

/** Placeholder for the PayPal Subscriptions API -- no real network call. */
export async function createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
  console.log(
    `[paypal-addon] creating subscription for plan "${input.planId}" using client ${paypalEnv.PAYPAL_CLIENT_ID}`,
  );
  return {
    id: `SUB-${Math.random().toString(36).slice(2, 10)}`,
    status: "APPROVAL_PENDING",
  };
}
