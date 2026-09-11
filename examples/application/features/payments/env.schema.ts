// REFERENCE ONLY -- not part of this example's active code, and never
// discovered by generate-manifest.mjs (it only includes src/env.ts).
//
// This example intentionally uses one centralized schema at src/env.ts
// (see that file for why). This is what the payments slice of that schema
// would look like split into its own capability-owned contract, per
// specs/migrations/from-centralized-schema.md. See examples/team-service
// for a working multi-contract example.
// import { createEnv, documentEnv, type RawEnv } from "env-cap";

/**
 * The payments capability owns its own environment contract. Nothing outside
 * this file needs to know these variables exist until it imports this export.
 *
 * The schema (createEnv) and its documentation (documentEnv) are split on
 * purpose: createEnv only ever sees processor/validator/default -- the
 * fields validateEnv() actually reads -- so nothing here is retained in
 * memory beyond what's needed to process the environment. documentEnv is a
 * no-op at runtime; it exists purely so `generateEnvManifest()` can build
 * the docs artifact, the ownership matrix, and the lifecycle report.
 */
// const paymentsSchema = {
//   PAYMENT_PROVIDER: {
//     default: "stripe",
//     processor: (value: unknown): string => String(value),
//     validator: (value: string) =>
//       ["stripe", "paypal"].includes(value) || `Unsupported payment provider "${value}".`,
//   },
//   // Declared independently by both payments and database (see ../database/env.schema.ts) --
//   // not a conflict, see the root README's "Duplicate variables" section.
//   LOG_LEVEL: {
//     default: "info",
//     processor: (value: unknown): string => String(value ?? "info"),
//     validator: (value: string) =>
//       ["debug", "info", "warn", "error"].includes(value) || `Expected one of: debug, info, warn, error.`,
//   },
//   STRIPE_KEY: {
//     processor: (value: unknown): string => String(value ?? ""),
//     // Conditional validation: only required when PAYMENT_PROVIDER is "stripe".
//     validator: (value: string, rawEnv: RawEnv) => {
//       if (rawEnv["PAYMENT_PROVIDER"] !== "stripe") return true;
//       return value.length > 0 || "Stripe key is required when PAYMENT_PROVIDER=stripe.";
//     },
//   },
// };

// export const paymentsEnv = createEnv(paymentsSchema, { name: "payments", source: import.meta.url });

// documentEnv(paymentsSchema, {
//   owner: "payments-team",
//   variables: {
//     PAYMENT_PROVIDER: {
//       description: "Which payment provider this deployment uses.",
//       setup: 'Set to "stripe" or "paypal" to match the gateway this deployment integrates.',
//     },
//     LOG_LEVEL: {
//       description: "Minimum log level for this capability's own logger.",
//     },
//     STRIPE_KEY: {
//       description: "Stripe secret key used to authenticate server-side API calls.",
//       documentation: "https://dashboard.stripe.com/apikeys",
//       setup: "Create a restricted API key in the Stripe dashboard.",
//       required: true,
//       expiresAt: "2026-09-01",
//       refreshInstructions: "Rotate in the Stripe dashboard (Developers -> API keys), then redeploy. Rotate every 90 days.",
//     },
//   },
// });
