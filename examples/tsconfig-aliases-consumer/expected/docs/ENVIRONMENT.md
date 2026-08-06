<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->

# Environment Variables

_Generated 2026-08-06T19:39:48.759Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [billing](#contract-billing)
  - [payments](#contract-payments)
- [Ownership matrix](#ownership-matrix)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-billing"></a>
## billing

Source: `src/features/billing/env.schema.ts`
- Active: yes
- Owner: billing-team

<a id="billing-billing_webhook_secret"></a>
### `BILLING_WEBHOOK_SECRET`

Shared secret used to verify inbound billing webhook signatures.

- Default: no
- Processor: yes
- Validator: yes
- Owner: billing-team
- Required: yes

<a id="contract-payments"></a>
## payments

Source: `node_modules/@examples/tsconfig-aliases/src/features/payments/env.schema.ts`
- Active: yes
- Owner: payments-team

<a id="payments-stripe_key"></a>
### `STRIPE_KEY`

Stripe secret key used to authenticate server-side API calls.

- Default: no
- Processor: yes
- Validator: no
- Owner: payments-team
- Required: yes

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| billing-team | [`BILLING_WEBHOOK_SECRET` (billing)](#billing-billing_webhook_secret) |
| payments-team | [`STRIPE_KEY` (payments)](#payments-stripe_key) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `BILLING_WEBHOOK_SECRET` | [billing (`src/features/billing/env.schema.ts`)](#billing-billing_webhook_secret) |
| `STRIPE_KEY` | [payments (`node_modules/@examples/tsconfig-aliases/src/features/payments/env.schema.ts`)](#payments-stripe_key) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`BILLING_WEBHOOK_SECRET`](#billing-billing_webhook_secret) | billing-team | -- | -- |
| [`STRIPE_KEY`](#payments-stripe_key) | payments-team | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 2
- Total variable declarations: 2 (2 from active contracts)
- Unique variable names: 2
- Variables with `expiresAt` set: 0
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 2
- Variables with refresh instructions: 0
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
