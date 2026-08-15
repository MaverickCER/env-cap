import { createEnv, documentEnv, type RawEnv } from "@maverickcer/env-cap";
import { processors, validators } from "@maverickcer/env-cap/helpers";

/**
 * The exact same schema as examples/basic-node/src/env.ts, deliberately --
 * this example isn't about the runtime contract (basic-node already covers
 * that), it's about proving each projection's output is byte-identical to
 * what the existing, already-tested code path produces on the exact same
 * input. See scripts/project-env-example.mjs.
 */
const schema = {
  DATABASE_URL: {
    processor: processors.url(),
  },
  PORT: {
    default: 5432,
    processor: processors.number(),
    validator: validators.range(1, 65535),
  },
  LOG_LEVEL: {
    default: "info",
    processor: (value: unknown): string => String(value ?? "info"),
    validator: (value: string) =>
      ["debug", "info", "warn", "error"].includes(value) ||
      `Expected one of: debug, info, warn, error.`,
  },
  PAYMENT_PROVIDER: {
    default: "stripe",
    processor: (value: unknown): string => String(value),
    validator: (value: string) =>
      ["stripe", "paypal"].includes(value) || `Unsupported payment provider "${value}".`,
  },
  STRIPE_KEY: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string, rawEnv: RawEnv) => {
      if (rawEnv["PAYMENT_PROVIDER"] !== "stripe") return true;
      return value.length > 0 || "Stripe key is required when PAYMENT_PROVIDER=stripe.";
    },
  },
};

export const env = createEnv(schema, { name: "app", source: import.meta.url });

documentEnv(schema, {
  owner: "platform-team",
  variables: {
    DATABASE_URL: {
      description: "Postgres connection string.",
      setup:
        "Provision a Postgres instance and paste its connection string, e.g. postgres://user:pass@host:5432/dbname.",
      required: true,
    },
    PORT: {
      description: "Database port.",
    },
    LOG_LEVEL: {
      description: "Minimum log level for this application's logger.",
    },
    PAYMENT_PROVIDER: {
      description: "Which payment provider this deployment uses.",
      setup: 'Set to "stripe" or "paypal" to match the gateway this deployment integrates.',
    },
    STRIPE_KEY: {
      description: "Stripe secret key used to authenticate server-side API calls.",
      documentation: "https://dashboard.stripe.com/apikeys",
      setup: "Create a restricted API key in the Stripe dashboard.",
      required: true,
      expiresAt: "2026-09-01",
      refreshInstructions:
        "Rotate in the Stripe dashboard (Developers -> API keys), then redeploy. Rotate every 90 days.",
    },
  },
});
