import { createEnv, documentEnv } from "@maverickcer/env-cap";

/**
 * This contract is imported only through the "@/*" tsconfig path alias
 * declared in this example's own tsconfig.json -- never through a relative
 * import (see src/server.ts). Without ADR 0023's alias resolution, env-cap's
 * Dependency & Ownership Report would misreport this contract as
 * "abandoned" (never imported anywhere), even though src/server.ts plainly
 * imports and reads it. See docs/OWNERSHIP.md (generated) and this
 * example's README for the actual proof.
 */
const schema = {
  STRIPE_KEY: {
    processor: (value: unknown): string => String(value ?? ""),
  },
};

export const paymentsEnv = createEnv(schema, { name: "payments", source: import.meta.url });

documentEnv(schema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: {
      description: "Stripe secret key used to authenticate server-side API calls.",
      required: true,
    },
  },
});
