import { createEnv, documentEnv } from "@maverickcer/env-cap";
import { processors } from "@maverickcer/env-cap/helpers";

/**
 * A fully valid, fully satisfied capability -- every variable it declares is
 * present in the committed .env. It exists specifically to prove that
 * validateEnv() aggregation doesn't just report the one broken contract in
 * isolation: this capability's own validation succeeds, but the application
 * still never starts, because a *different* capability's required variable
 * (see features/payments) is missing. One deterministic startup boundary
 * means every contract is validated together, not "the first one that fails."
 */
const databaseSchema = {
  DATABASE_URL: {
    processor: processors.url(),
  },
};

export const databaseEnv = createEnv(databaseSchema, { name: "database", source: import.meta.url });

documentEnv(databaseSchema, {
  owner: "data-platform-team",
  variables: {
    DATABASE_URL: { description: "Postgres connection string.", required: true },
  },
});
