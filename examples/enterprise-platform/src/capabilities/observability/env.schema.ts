import { createEnv, documentEnv } from "env-cap";

const LOG_LEVELS = ["debug", "info", "warn", "error"];

function logLevel(value: unknown): string {
  return String(value ?? "info");
}

/**
 * A capability that's fully "complete" with zero variables set -- a distinct
 * pattern from every other capability here, all of which need at least one
 * value to do anything. `pino` genuinely runs regardless of credentials;
 * Sentry gracefully no-ops with no DSN (tested only for "doesn't throw").
 */
const observabilitySchema = {
  LOG_LEVEL: {
    default: "info",
    processor: logLevel,
    validator: (value: string) =>
      LOG_LEVELS.includes(value) || `LOG_LEVEL must be one of: ${LOG_LEVELS.join(", ")}.`,
  },
  SENTRY_DSN: {},
};

export const observabilityEnv = createEnv(observabilitySchema, {
  name: "observability",
  source: import.meta.url,
});

documentEnv(observabilitySchema, {
  category: "observability",
  owner: "platform-team",
  variables: {
    LOG_LEVEL: { description: "Minimum level pino logs at." },
    SENTRY_DSN: {
      description: "Sentry DSN for error reporting. Unset: Sentry is never initialized; pino logging still runs.",
      sensitivity: "credential",
      legalBasis: "Legitimate interest -- operational error monitoring, not user tracking.",
      metadata: {
        documentation: "https://docs.sentry.io/product/sentry-basics/dsn-explainer/",
      },
    },
  },
});
