import { createEnv, documentEnv } from "@maverickcer/env-cap";
import { validators } from "@maverickcer/env-cap/helpers";

/**
 * One schema, one manifest, three variables demonstrating validation
 * contexts (ADR 0022):
 *
 *  - LOG_LEVEL has no `context` -- it participates in every validateEnv()
 *    run, regardless of activeContexts.
 *  - DATABASE_URL is scoped to `context: "server"`.
 *  - PUBLIC_API_URL is scoped to `context: "client"`.
 *
 * src/server.ts and src/client.ts each validate this same manifest, in
 * their own process, with different activeContexts -- see README.md for
 * why that's two npm scripts/processes rather than two validateEnv() calls
 * in one script (validateEnv() is one-shot per process, by design, both
 * before and after this feature).
 */
const schema = {
  LOG_LEVEL: {
    default: "info",
    processor: (value: unknown): string => String(value),
  },
  DATABASE_URL: {
    context: "server",
    processor: (value: unknown): string => String(value ?? ""),
    validator: validators.required(),
  },
  PUBLIC_API_URL: {
    context: "client",
    processor: (value: unknown): string => String(value ?? ""),
    validator: validators.required(),
  },
};

export const appEnv = createEnv(schema, { name: "app", source: import.meta.url });

documentEnv(schema, {
  variables: {
    LOG_LEVEL: {
      description: "Log verbosity. No validation context -- read by both the server and the client bundle.",
      owner: "team-platform",
    },
    DATABASE_URL: {
      description: "Postgres connection string. Server-only: never read from a browser bundle.",
      owner: "team-platform",
      required: true,
    },
    PUBLIC_API_URL: {
      description: "Public API base URL. Safe to expose to the browser.",
      owner: "team-platform",
      required: true,
    },
  },
});
