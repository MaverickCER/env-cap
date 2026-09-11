import { createEnv, documentEnv } from "env-cap";
import { processors } from "env-cap/helpers";

/**
 * The default of the two interchangeable database backends this boilerplate
 * ships (see mongodb/). `exclusiveGroup: "database"` (shared with mongodb,
 * set via documentEnv) means generateEnvManifest() rejects any build that
 * leaves both active at once -- the two are genuine alternatives, never
 * meant to run together.
 *
 * `DATABASE_URL` sets its own `owner`, overriding the contract's
 * `data-platform-team` -- the connection string embeds a live database
 * credential, and this org's policy is that credential rotation is
 * security-team's call even when the capability around it belongs to
 * another team. `effectiveOwner()` (the same resolution the generated
 * ownership matrix and security review use) reads the variable's own
 * `owner` first and only falls back to the contract's -- so
 * `docs/ENVIRONMENT.md`'s per-variable "Owner" line and ownership matrix
 * both show `security-team` for this one variable, while
 * `docs/OWNERSHIP.md`'s contract-level table still shows the *contract*
 * (the postgres capability itself) as `data-platform-team`'s. Both are
 * correct at their own level -- that's the point: a team can own running a
 * capability without owning every credential inside it.
 */
const postgresSchema = {
  DATABASE_URL: {
    processor: processors.toURL(),
  },
};

export const postgresEnv = createEnv(postgresSchema, { name: "postgres", source: import.meta.url });

documentEnv(postgresSchema, {
  category: "database",
  exclusiveGroup: "database",
  active: true,
  owner: "data-platform-team",
  metadata: {
    runbook: "https://wiki.internal/runbooks/postgres-failover",
  },
  variables: {
    DATABASE_URL: {
      description: "Postgres connection string.",
      owner: "security-team",
      sensitivity: "secret",
      setupInstructions:
        "Request a scoped database credential from security-team's vault (see the runbook); do not reuse another service's connection string.",
      expiresAt: "2026-10-15",
      refreshInstructions:
        "security-team rotates this credential quarterly via the vault; data-platform-team just needs to redeploy after a rotation lands.",
    },
  },
});
