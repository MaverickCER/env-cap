// REFERENCE ONLY -- not part of this example's active code, and never
// discovered by generate-manifest.mjs (it only includes src/env.ts).
//
// This example intentionally uses one centralized schema at src/env.ts
// (see that file for why). This is what the database slice of that schema
// would look like split into its own capability-owned contract, per
// specs/migrations/from-centralized-schema.md. See examples/composable-boilerplates
// for a working multi-contract example.
// import { createEnv, documentEnv } from "@maverickcer/env-cap";
// import { processors, validators } from "@maverickcer/env-cap/helpers";

/**
 * Using the optional helpers subpath for common coercions -- entirely
 * equivalent to writing the processor/validator functions by hand.
 */
// const databaseSchema = {
//   DATABASE_URL: {
//     processor: processors.url(),
//   },
//   PORT: {
//     default: 5432,
//     processor: processors.number(),
//     validator: validators.range(1, 65535),
//   },
//   // Declared independently by both database and payments (see ../payments/env.schema.ts) --
//   // not a conflict, see the root README's "Duplicate variables" section.
//   LOG_LEVEL: {
//     default: "info",
//     processor: (value: unknown): string => String(value ?? "info"),
//     validator: (value: string) =>
//       ["debug", "info", "warn", "error"].includes(value) || `Expected one of: debug, info, warn, error.`,
//   },
// };

// export const databaseEnv = createEnv(databaseSchema, { name: "database", source: import.meta.url });

// documentEnv(databaseSchema, {
//   owner: "data-platform-team",
//   variables: {
//     DATABASE_URL: {
//       description: "Postgres connection string.",
//       setup: "Provision a Postgres instance and paste its connection string, e.g. postgres://user:pass@host:5432/dbname.",
//       required: true,
//     },
//     PORT: {
//       description: "Database port.",
//     },
//     LOG_LEVEL: {
//       description: "Minimum log level for this capability's own logger.",
//     },
//   },
// });
