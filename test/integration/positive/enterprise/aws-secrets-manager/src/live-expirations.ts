import { DescribeSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { LiveExpirationDates } from "env-cap/build";

/**
 * Uses the default AWS credential provider chain (environment variables,
 * shared config/credentials files, ECS/EC2 instance role, ...) -- this
 * example never hardcodes credentials, and auth is entirely the consumer's
 * responsibility. Swap this for whatever client construction your own AWS
 * setup requires (explicit region, assumed role, etc.).
 */
const client = new SecretsManagerClient({});

/**
 * Consumer-owned naming convention: env-cap variable name -> AWS Secrets
 * Manager secret name. env-cap has no opinion on how you name secrets; this
 * mapping is this example's own choice. A variable with no entry here is
 * skipped entirely and keeps whatever static `expiresAt` its `documentEnv()`
 * call set.
 */
const SECRET_NAME_BY_VARIABLE: Readonly<Record<string, string>> = {
  STRIPE_SECRET_KEY: "prod/stripe/secret-key",
  DATABASE_PASSWORD: "prod/database/password",
};

/**
 * Implements env-cap's `liveExpirationDates` callback using AWS Secrets
 * Manager's *rotation* metadata as an expiration proxy.
 *
 * Important: AWS Secrets Manager has no field that means "this secret
 * expires on this date." `NextRotationDate` (only present when
 * `RotationEnabled` is true) is "the latest date rotation will occur, but
 * not an approximate rotation date" per AWS's own documentation -- this
 * example chooses to treat it as a useful expiration signal anyway (a secret
 * scheduled to rotate is, in practice, a secret whose current value has a
 * deadline), but that is an interpretation this example makes, not something
 * AWS Secrets Manager asserts. A secret with rotation disabled has no
 * `NextRotationDate` at all and is not represented by this callback -- see
 * this package's README for the full discussion.
 *
 * Only ever calls `DescribeSecretCommand` -- never `GetSecretValueCommand` or
 * any other API that would expose secret contents. This callback returns
 * metadata only.
 */
export const liveExpirationDates: LiveExpirationDates = async (variableNames) => {
  const overrides: Record<string, string> = {};

  await Promise.all(
    variableNames.map(async (variableName) => {
      const secretName = SECRET_NAME_BY_VARIABLE[variableName];
      if (!secretName) return;

      try {
        const response = await client.send(new DescribeSecretCommand({ SecretId: secretName }));
        if (response.RotationEnabled && response.NextRotationDate) {
          overrides[variableName] = response.NextRotationDate.toISOString();
        }
      } catch (error) {
        // This example's own policy: log and fall back to the static
        // `expiresAt` for this one variable rather than failing the whole
        // generation run over one missing/renamed/inaccessible secret. A
        // stricter consumer might prefer to let this throw instead -- see
        // the README's "Error handling is a policy choice" section.
        console.warn(`liveExpirationDates: could not describe secret "${secretName}" for "${variableName}":`, error);
      }
    }),
  );

  return overrides;
};
