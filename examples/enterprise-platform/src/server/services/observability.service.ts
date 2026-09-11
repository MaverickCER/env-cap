import * as Sentry from "@sentry/node";
import pino from "pino";
import { observabilityEnv } from "../../capabilities/observability/env.schema.js";

/** pino genuinely runs regardless of credentials -- this capability is fully "complete" with zero variables set. */
export const logger = pino({ level: observabilityEnv.LOG_LEVEL });

let sentryInitialized = false;

/** No-ops with no DSN -- tested only for "doesn't throw," matching the plan's own stated bar for this capability. */
export function initObservability(): void {
  if (sentryInitialized || !observabilityEnv.SENTRY_DSN) return;
  Sentry.init({ dsn: observabilityEnv.SENTRY_DSN });
  sentryInitialized = true;
}

export function captureError(error: unknown): void {
  logger.error({ error }, "unhandled error");
  if (observabilityEnv.SENTRY_DSN) Sentry.captureException(error);
}
