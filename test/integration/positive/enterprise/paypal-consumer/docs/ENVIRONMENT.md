<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-11T07:23:24.469Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [paypal-addon](#contract-paypal-addon)
  - [paypal-consumer-app](#contract-paypal-consumer-app)
- [Ownership matrix](#ownership-matrix)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-paypal-addon"></a>
## paypal-addon

Source: `node_modules/@examples/paypal-addon/src/env.schema.ts`
- Active: yes
- Category: payments
- Owner: paypal-addon-maintainers

<a id="paypal-addon-paypal_client_id"></a>
### `PAYPAL_CLIENT_ID`

PayPal REST API client ID for this application's PayPal app.

- Default: no
- Processor: yes
- Validator: yes
- Owner: paypal-addon-maintainers
- Setup instructions: Create an app in the PayPal Developer Dashboard and copy its client ID.

<a id="paypal-addon-paypal_client_secret"></a>
### `PAYPAL_CLIENT_SECRET`

PayPal REST API client secret.

- Default: no
- Processor: yes
- Validator: yes
- Owner: paypal-addon-maintainers
- Expires: 2027-01-01
- Refresh instructions: Rotate in the PayPal Developer Dashboard, then redeploy.
- Required: yes

<a id="paypal-addon-paypal_webhook_id"></a>
### `PAYPAL_WEBHOOK_ID`

Webhook ID PayPal uses to sign event notifications sent to this app.

- Default: no
- Processor: yes
- Validator: yes
- Owner: paypal-addon-maintainers
- Setup instructions: Copy the webhook ID from the PayPal Developer Dashboard's Webhooks page.

<a id="contract-paypal-consumer-app"></a>
## paypal-consumer-app

Source: `src/env.schema.ts`
- Active: yes
- Category: app
- Owner: platform-team

<a id="paypal-consumer-app-app_name"></a>
### `APP_NAME`

Display name for this service, used in startup logs.

- Default: yes
- Processor: yes
- Validator: no
- Owner: platform-team

<a id="paypal-consumer-app-port"></a>
### `PORT`

Port this service listens on.

- Default: yes
- Processor: yes
- Validator: yes
- Owner: platform-team

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| paypal-addon-maintainers | [`PAYPAL_CLIENT_ID` (paypal-addon)](#paypal-addon-paypal_client_id), [`PAYPAL_CLIENT_SECRET` (paypal-addon)](#paypal-addon-paypal_client_secret), [`PAYPAL_WEBHOOK_ID` (paypal-addon)](#paypal-addon-paypal_webhook_id) |
| platform-team | [`APP_NAME` (paypal-consumer-app)](#paypal-consumer-app-app_name), [`PORT` (paypal-consumer-app)](#paypal-consumer-app-port) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `APP_NAME` | [paypal-consumer-app (`src/env.schema.ts`)](#paypal-consumer-app-app_name) |
| `PAYPAL_CLIENT_ID` | [paypal-addon (`node_modules/@examples/paypal-addon/src/env.schema.ts`)](#paypal-addon-paypal_client_id) |
| `PAYPAL_CLIENT_SECRET` | [paypal-addon (`node_modules/@examples/paypal-addon/src/env.schema.ts`)](#paypal-addon-paypal_client_secret) |
| `PAYPAL_WEBHOOK_ID` | [paypal-addon (`node_modules/@examples/paypal-addon/src/env.schema.ts`)](#paypal-addon-paypal_webhook_id) |
| `PORT` | [paypal-consumer-app (`src/env.schema.ts`)](#paypal-consumer-app-port) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`PAYPAL_CLIENT_ID`](#paypal-addon-paypal_client_id) | paypal-addon-maintainers | -- | -- |
| [`PAYPAL_CLIENT_SECRET`](#paypal-addon-paypal_client_secret) | paypal-addon-maintainers | 2027-01-01 | Rotate in the PayPal Developer Dashboard, then redeploy. |
| [`PAYPAL_WEBHOOK_ID`](#paypal-addon-paypal_webhook_id) | paypal-addon-maintainers | -- | -- |
| [`APP_NAME`](#paypal-consumer-app-app_name) | platform-team | -- | -- |
| [`PORT`](#paypal-consumer-app-port) | platform-team | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 2
- Total variable declarations: 5 (5 from active contracts)
- Unique variable names: 5
- Variables with `expiresAt` set: 1
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 1
- Variables with refresh instructions: 1
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
