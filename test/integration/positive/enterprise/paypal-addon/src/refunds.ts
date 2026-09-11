import { paypalEnv } from "./env.schema.js";

export interface CreateRefundInput {
  captureId: string;
  amount?: number;
}

export interface Refund {
  id: string;
  status: "COMPLETED";
}

/** Placeholder for the PayPal Payments API -- no real network call. */
export async function createRefund(input: CreateRefundInput): Promise<Refund> {
  console.log(`[paypal-addon] refunding capture "${input.captureId}" using client ${paypalEnv.PAYPAL_CLIENT_ID}`);
  return {
    id: `REFUND-${Math.random().toString(36).slice(2, 10)}`,
    status: "COMPLETED",
  };
}
