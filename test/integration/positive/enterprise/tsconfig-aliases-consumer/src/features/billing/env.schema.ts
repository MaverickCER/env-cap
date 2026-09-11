import { createEnv, documentEnv } from "env-cap";

/**
 * This application's own local capability contract, organized through this
 * example's own "@/*" tsconfig path alias (ADR 0023) -- the same way
 * @examples/tsconfig-aliases organizes its own contract, just in a
 * different project. src/app.ts imports this alongside `paymentsEnv`,
 * installed as an ordinary package dependency (ADR 0014) -- see README.md.
 */
const schema = {
  BILLING_WEBHOOK_SECRET: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.length > 0 || "BILLING_WEBHOOK_SECRET is required.",
  },
};

export const billingEnv = createEnv(schema, { name: "billing", source: import.meta.url });

documentEnv(schema, {
  owner: "billing-team",
  variables: {
    BILLING_WEBHOOK_SECRET: {
      description: "Shared secret used to verify inbound billing webhook signatures.",
      required: true,
    },
  },
});
