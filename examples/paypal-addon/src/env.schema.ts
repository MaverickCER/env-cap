import { createEnv, documentEnv } from "@maverickcer/env-cap";

/**
 * paypal-addon is a reusable internal package, not an application feature
 * folder -- it owns this contract the same way `features/payments/env.schema.ts`
 * owns its contract in `examples/basic-node`. Capability ownership follows
 * whichever module calls `createEnv()`, not the directory it happens to live
 * in (see the root README's "Capability-owned configuration" section).
 */
const paypalSchema = {
  PAYPAL_CLIENT_ID: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.length > 0 || "PAYPAL_CLIENT_ID is required.",
  },
  PAYPAL_CLIENT_SECRET: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.length > 0 || "PAYPAL_CLIENT_SECRET is required.",
  },
  PAYPAL_WEBHOOK_ID: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.length > 0 || "PAYPAL_WEBHOOK_ID is required.",
  },
};

export const paypalEnv = createEnv(paypalSchema, {
  name: "paypal-addon",
  source: import.meta.url,
});

// documentEnv() returns void and is inert at runtime (src/runtime/document.ts) --
// there is no exported "paypalDoc" to consume. generateEnvManifest() links this
// call back to paypalSchema through static analysis; nothing here is retained
// in memory or re-exported from index.ts.
documentEnv(paypalSchema, {
  owner: "paypal-addon-maintainers",
  category: "payments",
  variables: {
    PAYPAL_CLIENT_ID: {
      description: "PayPal REST API client ID for this application's PayPal app.",
      setup: "Create an app in the PayPal Developer Dashboard and copy its client ID.",
    },
    PAYPAL_CLIENT_SECRET: {
      description: "PayPal REST API client secret.",
      required: true,
      expiresAt: "2027-01-01",
      refreshInstructions: "Rotate in the PayPal Developer Dashboard, then redeploy.",
    },
    PAYPAL_WEBHOOK_ID: {
      description: "Webhook ID PayPal uses to sign event notifications sent to this app.",
      setup: "Copy the webhook ID from the PayPal Developer Dashboard's Webhooks page.",
    },
  },
});
