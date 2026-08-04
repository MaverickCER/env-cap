import { createEnv, documentEnv } from "@maverickcer/env-cap";
import { processors } from "@maverickcer/env-cap/helpers";

/**
 * Shipped dormant (active: false, now set via documentEnv -- see below) so a
 * team can switch to Mongo later by flipping this to true and postgres's to
 * false -- without vendoring new code or losing template updates.
 * generateEnvManifest() enforces that at most one member of the "database"
 * exclusiveGroup is ever active, so enabling this without disabling postgres
 * is a build-time error, not a silent double-wire.
 *
 * While inactive, this contract is excluded from the generated contract
 * entirely: neither of its variables is required by validateEnv(), and
 * reading mongoEnv.DATABASE_URL throws EnvNotReadyError -- exactly the
 * signal you want if application code still references a backend nobody
 * selected. See src/app.ts, which only ever imports the active backend.
 */
const mongoSchema = {
  DATABASE_URL: {
    processor: processors.url(),
  },
  MONGODB_REPLICA_SET: {
    default: "rs0",
  },
};

export const mongoEnv = createEnv(mongoSchema, { name: "mongodb", source: import.meta.url });

documentEnv(mongoSchema, {
  category: "database",
  exclusiveGroup: "database",
  active: false,
  owner: "Data Platform team",
  metadata: {
    runbook: "https://wiki.internal/runbooks/mongodb-failover",
  },
  variables: {
    DATABASE_URL: { description: "MongoDB connection string." },
    MONGODB_REPLICA_SET: { description: "MongoDB replica set name -- no Postgres equivalent." },
  },
});
