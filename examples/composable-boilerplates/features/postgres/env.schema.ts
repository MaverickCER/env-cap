import { createEnv, documentEnv } from "@maverickcer/env-cap";
import { processors } from "@maverickcer/env-cap/helpers";

/**
 * The default of the two interchangeable database backends this boilerplate
 * ships (see mongodb/). `exclusiveGroup: "database"` (shared with mongodb,
 * set via documentEnv) means generateEnvManifest() rejects any build that
 * leaves both active at once -- the two are genuine alternatives, never
 * meant to run together.
 */
const postgresSchema = {
  DATABASE_URL: {
    processor: processors.url(),
  },
};

export const postgresEnv = createEnv(postgresSchema, { name: "postgres", source: import.meta.url });

documentEnv(postgresSchema, {
  category: "database",
  exclusiveGroup: "database",
  active: true,
  owner: "Data Platform team",
  metadata: {
    runbook: "https://wiki.internal/runbooks/postgres-failover",
  },
  variables: {
    DATABASE_URL: { description: "Postgres connection string." },
  },
});
