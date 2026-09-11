# aws-secrets-manager example

A standalone example showing how a consumer can implement env-cap's
`liveExpirationDates` callback (see `generateEnvArtifacts({ liveExpirationDates })`) using
AWS Secrets Manager rotation metadata, instead of relying only on the static
`expiresAt` values set in `documentEnv()` calls.

```
src/
  env.schema.ts       <- the capability's contract: createEnv() + documentEnv(),
                          with static fallback expiresAt values
  live-expirations.ts <- the liveExpirationDates implementation
  index.ts             <- public export: secretsEnv
scripts/
  generate-manifest.mjs <- generateEnvArtifacts({ ..., liveExpirationDates })
```

`documentEnv()` returns `void` and is inert at runtime by design -- its only
job is to exist as a static marker `generateEnvArtifacts()`'s AST-based discovery
can link back to `secretsSchema` during build-time analysis. This example's
`expiresAt` values are static fallbacks: what generated docs show if
`liveExpirationDates` is omitted, or for any secret not covered by the
naming-convention map below.

## Generating this package's docs and `.env.example`

```bash
npm install
npm run generate:env
```

This calls AWS Secrets Manager (`DescribeSecretCommand`) for every discovered
variable name that has an entry in `live-expirations.ts`'s
`SECRET_NAME_BY_VARIABLE` map, using whatever AWS credentials are already
configured in your environment (see "Auth, caching, retries... are entirely
consumer-owned" below). Without valid AWS credentials/access, each
`DescribeSecretCommand` call fails, is logged, and that variable's static
`expiresAt` is used instead -- `generate:env` still succeeds.

## What this example actually demonstrates

**AWS Secrets Manager has no field that means "this secret expires on this
date."** There is no such concept in the service. What it *does* have is
rotation metadata: `RotationEnabled` and `NextRotationDate` on the response
from `DescribeSecretCommand`. This example treats `NextRotationDate` (when
`RotationEnabled` is true) as an *expiration proxy* -- a secret scheduled to
rotate is, in practice, a secret whose current value has a deadline -- but
that is an interpretation this example makes, not something AWS Secrets
Manager itself asserts. AWS's own documentation for `NextRotationDate` is
explicit that it "represents the latest date that rotation will occur, but it
is not an approximate rotation date." A secret with rotation disabled has no
`NextRotationDate` at all and simply isn't represented by this callback --
its variable keeps its static `expiresAt`.

## Why `DescribeSecretCommand`, never `GetSecretValueCommand`

`secretsmanager:DescribeSecret` is a distinct, narrower IAM action from
`secretsmanager:GetSecretValue` -- it returns metadata (rotation status,
ARN, tags, timestamps, ...) and never the secret's actual plaintext value.
`live-expirations.ts` only ever calls `DescribeSecretCommand`. An IAM policy
for a role running this example only needs to grant the narrower action,
scoped to the specific secrets it maps:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:DescribeSecret",
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:prod/stripe/secret-key-*",
        "arn:aws:secretsmanager:*:*:secret:prod/database/password-*"
      ]
    }
  ]
}
```

## Auth, caching, retries, rate limiting, and persistence are entirely consumer-owned

env-cap's `liveExpirationDates` contract only asks for expiration metadata --
everything about *how* that metadata is fetched is this example's own
choice, not something the library provides or requires:

* **Auth**: `SecretsManagerClient({})` uses the default AWS credential
  provider chain (environment variables, shared config/credentials files, an
  ECS/EC2/Lambda execution role, ...). No credentials are hardcoded anywhere
  in this example.
* **Caching**: none. Every `generate:env` run re-describes every mapped
  secret from scratch.
* **Retries**: whatever the AWS SDK's own default retry strategy provides for
  transient errors -- this example adds no additional retry logic on top.
* **Rate limiting**: none added by this example; `Promise.all` issues one
  `DescribeSecretCommand` per mapped variable concurrently.
* **Persistence**: none -- nothing about a previous run's rotation dates is
  stored or reused.

A real integration might want all five; this example deliberately keeps them
out so the `liveExpirationDates` plumbing itself stays legible.

## Why `tsx` instead of `node` for `generate:env`

Every other example in this repo runs its `generate:env` script via plain
`node scripts/generate-manifest.mjs`, because none of them need a real JS
value from their own `src/` -- their `generateEnvArtifacts()` calls only ever pass
plain strings and booleans. This example is the first that needs to import a
real function (`liveExpirationDates`) from `src/live-expirations.ts`, so
`generate:env` runs via `tsx scripts/generate-manifest.mjs` instead. `tsx`'s
loader hooks apply across the whole module graph, so the `.mjs` entry point
can still `import { liveExpirationDates } from "../src/live-expirations.js"` (a
`.js` specifier resolving to the real `.ts` file, the same convention
`src/index.ts` already uses) and it works. This is a deliberate difference
from this repo's other examples, not an oversight.

## The `SECRET_NAME_BY_VARIABLE` naming convention

env-cap has no opinion on how you name secrets in AWS Secrets Manager --
mapping a discovered environment variable name (e.g. `STRIPE_SECRET_KEY`) to
an AWS secret name (e.g. `prod/stripe/secret-key`) is entirely this example's
own choice, hardcoded in `live-expirations.ts`. A variable with no entry in
that map is simply skipped and keeps its static `expiresAt`.

## Error handling is a policy choice

If a single `DescribeSecretCommand` call fails (missing secret, no
permission, a renamed secret still referenced by the map, ...),
`live-expirations.ts` logs a warning and falls back to that one variable's
static `expiresAt` rather than failing the entire `generate:env` run. This is
this *example's* policy choice, distinct from env-cap's own contract for the
`liveExpirationDates` callback itself: if `liveExpirationDates` as a whole rejects,
`generateEnvArtifacts()`/`generateDocumentation()` propagate that rejection
unchanged (see ADR 0012). A stricter consumer might prefer to let a single
secret's failure abort the whole run instead -- both are valid choices env-cap
leaves up to the caller.
