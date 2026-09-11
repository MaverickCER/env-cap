import { createEnv, documentEnv, type RawEnv } from "env-cap";
import { processors, validators } from "env-cap/helpers";

/**
 * The same contract as `examples/application` -- deliberately, so the only
 * new concept this example teaches is *how generation is invoked*, not a
 * new schema-authoring feature. `examples/application` runs a custom
 * `scripts/generate-manifest.mjs` that calls `generateEnvArtifacts()`
 * directly; this example never does that -- every `package.json` script
 * here invokes the packaged `env-cap` CLI binary instead (see README.md).
 *
 * One deliberate difference from basic-node: STRIPE_KEY has no `expiresAt`/
 * `refreshInstructions` here. That's not the point this example is making --
 * `test/integration/positive/enterprise/aws-secrets-manager` already owns that teaching point -- and
 * leaving it out keeps this example's CLI output (stdout, --json, --check)
 * fully deterministic for golden-file regression testing, with no
 * wall-clock-relative "Xd remaining" text to normalize.
 */
const schema = {
  DATABASE_URL: {
    processor: processors.toURL(),
  },
  PORT: {
    default: 5432,
    processor: processors.toNumber(),
    validator: validators.range(1, 65535),
  },
  LOG_LEVEL: {
    default: "info",
    processor: (value: unknown): string => String(value ?? "info"),
    validator: (value: string) =>
      ["debug", "info", "warn", "error"].includes(value) || `Expected one of: debug, info, warn, error.`,
  },
  PAYMENT_PROVIDER: {
    default: "stripe",
    processor: (value: unknown): string => String(value),
    validator: (value: string) =>
      ["stripe", "paypal"].includes(value) || `Unsupported payment provider "${value}".`,
  },
  STRIPE_KEY: {
    processor: (value: unknown): string => String(value ?? ""),
    // Conditional validation: only required when PAYMENT_PROVIDER is "stripe".
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
      setupInstructions: "Provision a Postgres instance and paste its connection string, e.g. postgres://user:pass@host:5432/dbname.",
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
      setupInstructions: 'Set to "stripe" or "paypal" to match the gateway this deployment integrates.',
    },
    STRIPE_KEY: {
      description: "Stripe secret key used to authenticate server-side API calls.",
      metadata: {
        documentation: "https://dashboard.stripe.com/apikeys",
      },
      setupInstructions: "Create a restricted API key in the Stripe dashboard.",
      required: true,
    },
  },
});
