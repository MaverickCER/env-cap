<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-11T07:14:26.411Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [app](#contract-app)
- [Ownership matrix](#ownership-matrix)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-app"></a>
## app

Source: `src/env.ts`
- Active: yes
- Owner: platform-team

<a id="app-database_url"></a>
### `DATABASE_URL`

Postgres connection string.

- Default: no
- Processor: yes
- Validator: no
- Owner: platform-team
- Setup instructions: Provision a Postgres instance and paste its connection string, e.g. postgres://user:pass@host:5432/dbname.
- Required: yes

<a id="app-log_level"></a>
### `LOG_LEVEL`

Minimum log level for this application's logger.

- Default: yes
- Processor: yes
- Validator: yes
- Owner: platform-team

<a id="app-payment_provider"></a>
### `PAYMENT_PROVIDER`

Which payment provider this deployment uses.

- Default: yes
- Processor: yes
- Validator: yes
- Owner: platform-team
- Setup instructions: Set to "stripe" or "paypal" to match the gateway this deployment integrates.

<a id="app-port"></a>
### `PORT`

Database port.

- Default: yes
- Processor: yes
- Validator: yes
- Owner: platform-team

<a id="app-stripe_key"></a>
### `STRIPE_KEY`

Stripe secret key used to authenticate server-side API calls.

- Default: no
- Processor: yes
- Validator: yes
- Owner: platform-team
- Expires: 2026-09-27
- Setup instructions: Create a restricted API key in the Stripe dashboard.
- Refresh instructions: Rotate in the Stripe dashboard (Developers -> API keys), then redeploy. Rotate every 90 days.
- Required: yes
- Documentation: https://dashboard.stripe.com/apikeys

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| platform-team | [`DATABASE_URL` (app)](#app-database_url), [`LOG_LEVEL` (app)](#app-log_level), [`PAYMENT_PROVIDER` (app)](#app-payment_provider), [`PORT` (app)](#app-port), [`STRIPE_KEY` (app)](#app-stripe_key) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `DATABASE_URL` | [app (`src/env.ts`)](#app-database_url) |
| `LOG_LEVEL` | [app (`src/env.ts`)](#app-log_level) |
| `PAYMENT_PROVIDER` | [app (`src/env.ts`)](#app-payment_provider) |
| `PORT` | [app (`src/env.ts`)](#app-port) |
| `STRIPE_KEY` | [app (`src/env.ts`)](#app-stripe_key) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`DATABASE_URL`](#app-database_url) | platform-team | -- | -- |
| [`LOG_LEVEL`](#app-log_level) | platform-team | -- | -- |
| [`PAYMENT_PROVIDER`](#app-payment_provider) | platform-team | -- | -- |
| [`PORT`](#app-port) | platform-team | -- | -- |
| [`STRIPE_KEY`](#app-stripe_key) | platform-team | 2026-09-27 (**16d remaining**) | Rotate in the Stripe dashboard (Developers -> API keys), then redeploy. Rotate every 90 days. |

## Security review

<a id="security-review"></a>

- Total contracts: 1
- Total variable declarations: 5 (5 from active contracts)
- Unique variable names: 5
- Variables with `expiresAt` set: 1
  - Already expired: 0
  - Expiring within 30 days: 1
- Variables marked `required: true`: 2
- Variables with refresh instructions: 1
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
