<!-- GENERATED FILE -- do not edit by hand. Regenerate it by re-running the script that calls `generateDocumentation()` / `generateUsageReport()` from `@maverickcer/env-cap/build`. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (https://github.com/MaverickCER/env-cap/blob/main/GUIDE.md), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `generateDocumentation()` from `@maverickcer/env-cap/build`._

_Generated 2026-10-03T04:30:40.567Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [aws-secrets-manager-example](#contract-aws-secrets-manager-example)
- [Ownership matrix](#ownership-matrix)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-aws-secrets-manager-example"></a>
## aws-secrets-manager-example

Source: `src/env.schema.ts`
- Active: yes
- Category: secrets
- Owner: platform-team

<a id="aws-secrets-manager-example-database_password"></a>
### `DATABASE_PASSWORD`

Primary database password, sourced from AWS Secrets Manager.

- Default: no
- Processor: yes
- Validator: yes
- Owner: platform-team
- Expires: 2026-02-01
- Refresh instructions: Rotate the secret in AWS Secrets Manager (secret: prod/database/password); no manual redeploy needed once rotation is enabled.
- Required: yes

<a id="aws-secrets-manager-example-stripe_secret_key"></a>
### `STRIPE_SECRET_KEY`

Stripe secret API key, sourced from AWS Secrets Manager.

- Default: no
- Processor: yes
- Validator: yes
- Owner: platform-team
- Expires: 2026-01-01
- Refresh instructions: Rotate the secret in AWS Secrets Manager (secret: prod/stripe/secret-key); no manual redeploy needed once rotation is enabled.
- Required: yes

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| platform-team | [`DATABASE_PASSWORD` (aws-secrets-manager-example)](#aws-secrets-manager-example-database_password), [`STRIPE_SECRET_KEY` (aws-secrets-manager-example)](#aws-secrets-manager-example-stripe_secret_key) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `DATABASE_PASSWORD` | [aws-secrets-manager-example (`src/env.schema.ts`)](#aws-secrets-manager-example-database_password) |
| `STRIPE_SECRET_KEY` | [aws-secrets-manager-example (`src/env.schema.ts`)](#aws-secrets-manager-example-stripe_secret_key) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`DATABASE_PASSWORD`](#aws-secrets-manager-example-database_password) | platform-team | 2026-02-01 (**expired 244d ago**) | Rotate the secret in AWS Secrets Manager (secret: prod/database/password); no manual redeploy needed once rotation is enabled. |
| [`STRIPE_SECRET_KEY`](#aws-secrets-manager-example-stripe_secret_key) | platform-team | 2026-01-01 (**expired 275d ago**) | Rotate the secret in AWS Secrets Manager (secret: prod/stripe/secret-key); no manual redeploy needed once rotation is enabled. |

## Security review

<a id="security-review"></a>

- Total contracts: 1
- Total variable declarations: 2 (2 from active contracts)
- Unique variable names: 2
- Variables with `expiresAt` set: 2
  - Already expired: 2
  - Expiring within 30 days: 0
- Variables marked `required: true`: 2
- Variables with refresh instructions: 2
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
