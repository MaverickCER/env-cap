import { createEnv, documentEnv } from "env-cap";

/**
 * This application's own local capability contract, alongside the imported
 * paypal-addon contract in app.ts -- generateEnvManifest() discovers both
 * (see scripts/generate-manifest.mjs) and validateEnv() validates both
 * together at startup.
 */
const appSchema = {
  APP_NAME: {
    default: "paypal-consumer",
    processor: (value: unknown): string => String(value ?? "paypal-consumer"),
  },
  PORT: {
    default: 3000,
    processor: (value: unknown): number => Number(value),
    validator: (value: number) => (Number.isInteger(value) && value > 0) || "Expected a positive integer.",
  },
};

export const appEnv = createEnv(appSchema, { name: "paypal-consumer-app", source: import.meta.url });

documentEnv(appSchema, {
  owner: "platform-team",
  category: "app",
  variables: {
    APP_NAME: {
      description: "Display name for this service, used in startup logs.",
    },
    PORT: {
      description: "Port this service listens on.",
    },
  },
});
