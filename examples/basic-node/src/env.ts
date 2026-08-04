import { createEnv, documentEnv, type RawEnv } from "@maverickcer/env-cap";
import { processors, validators } from "@maverickcer/env-cap/helpers";

/**
 * Using the optional helpers subpath for common coercions -- entirely
 * equivalent to writing the processor/validator functions by hand.
 * In production, we highly recommend forgoing the helpers in favor of using
 * your existing env validation library of choice, be it Zod, envalid, Joi, or
 * something else.
 *
 * This example intentionally keeps every variable in one centralized schema --
 * the way most teams already have a single `env.ts` today -- to show that
 * env-cap doesn't require capability-per-file ownership on day one. This one
 * `createEnv()` call still gets fail-fast startup validation, generated
 * documentation, a generated `.env.example`, and an ownership/blast-radius
 * report; per-capability ownership is an optional next step, not a
 * prerequisite. See `features/database/env.schema.ts` and
 * `features/payments/env.schema.ts` (both commented out, unused) for what
 * splitting this same schema apart would look like, `specs/migrations/from-centralized-schema.md`
 * for the migration path, and `examples/composable-boilerplates`/`examples/paypal-*`
 * for fully split, multi-contract examples.
 *
 * The schema (createEnv) and its documentation (documentEnv) are split on
 * purpose: createEnv only ever sees processor/validator/default -- the
 * fields validateEnv() actually reads -- so nothing here is retained in
 * memory beyond what's needed to process the environment.
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

/**
 * documentEnv is a no-op at runtime; it exists purely so
 * `generateEnvManifest()` can build the env artifacts to provide platform
 * teams with observability into what variables are required, what do the
 * variables do, do the variables have a default value, who owns them, when does
 * a variable need to be rotated next, how is the variable rotoated, which
 * variables are expiring soon, how many capabilities depend on them, what's the
 * blast radius if a variable is changed or fails to be rotated timely, which
 * variables aren't actively being used, and how can a new developer on the team
 * get up to speed quickly.
 */
documentEnv(schema, {
  owner: "platform-team",
  variables: {
    DATABASE_URL: {
      description: "Postgres connection string.",
      setup: "Provision a Postgres instance and paste its connection string, e.g. postgres://user:pass@host:5432/dbname.",
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
      refreshInstructions: "Rotate in the Stripe dashboard (Developers -> API keys), then redeploy. Rotate every 90 days.",
    },
  },
});
