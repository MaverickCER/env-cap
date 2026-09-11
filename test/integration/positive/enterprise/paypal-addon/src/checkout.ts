import { paypalEnv } from "./env.schema.js";

export interface CreateCheckoutInput {
  amount: number;
  currency: string;
}

export interface CheckoutSession {
  id: string;
  approveUrl: string;
}

/**
 * Placeholder for the PayPal Orders API -- no real network call, no real
 * PayPal integration. Reads its own capability's validated contract directly,
 * exactly as feature-folder business logic would.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
  const orderId = `ORDER-${Math.random().toString(36).slice(2, 10)}`;
  console.log(
    `[paypal-addon] creating checkout for ${input.amount} ${input.currency} using client ${paypalEnv.PAYPAL_CLIENT_ID}`,
  );
  return {
    id: orderId,
    approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
  };
}
