import { createEnv, documentEnv } from "env-cap";

/**
 * Two secret-backed variables whose real expiration signal lives in AWS
 * Secrets Manager, not in this file -- see `live-expirations.ts`. The
 * `expiresAt` values set here are static fallbacks: what generated docs show
 * if `liveExpirationDates` is omitted, or if a given secret has no entry in
 * `live-expirations.ts`'s naming-convention map, or if describing it fails.
 */
const secretsSchema = {
  STRIPE_SECRET_KEY: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.length > 0 || "STRIPE_SECRET_KEY is required.",
  },
  DATABASE_PASSWORD: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string) => value.length > 0 || "DATABASE_PASSWORD is required.",
  },
};

export const secretsEnv = createEnv(secretsSchema, {
  name: "aws-secrets-manager-example",
  source: import.meta.url,
});

// documentEnv() is inert at runtime -- generateEnvArtifacts() reads this through
// static analysis only, never by executing this file. The `expiresAt` values
// below are placeholders; running
// `npm run generate:env` with `liveExpirationDates` wired up (see
// scripts/generate-manifest.mjs) replaces them with AWS Secrets Manager's
// actual next-rotation date wherever a mapped secret is found.
documentEnv(secretsSchema, {
  owner: "platform-team",
  category: "secrets",
  variables: {
    STRIPE_SECRET_KEY: {
      description: "Stripe secret API key, sourced from AWS Secrets Manager.",
      required: true,
      expiresAt: "2026-12-31",
      refreshInstructions: "Rotate the secret in AWS Secrets Manager (secret: prod/stripe/secret-key); no manual redeploy needed once rotation is enabled.",
    },
    DATABASE_PASSWORD: {
      description: "Primary database password, sourced from AWS Secrets Manager.",
      required: true,
      expiresAt: "2026-12-31",
      refreshInstructions: "Rotate the secret in AWS Secrets Manager (secret: prod/database/password); no manual redeploy needed once rotation is enabled.",
    },
  },
});
