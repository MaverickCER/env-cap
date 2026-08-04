import { createEnv, documentEnv } from "@maverickcer/env-cap";

/**
 * The capability whose required variable this example's committed .env
 * deliberately omits (see .env -- STRIPE_KEY is absent, not just blank).
 * There is no `required` flag anywhere in env-cap's runtime vocabulary
 * (see specs/architecture.md) -- requiredness is expressed the same way it
 * is everywhere else in this codebase: a validator that rejects an empty
 * value.
 */
const paymentsSchema = {
  STRIPE_KEY: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.length > 0 || "STRIPE_KEY is required.",
  },
};

export const paymentsEnv = createEnv(paymentsSchema, { name: "payments", source: import.meta.url });

documentEnv(paymentsSchema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: {
      description: "Stripe secret key used to authenticate server-side API calls.",
      required: true,
    },
  },
});
