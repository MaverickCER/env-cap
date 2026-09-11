<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-11T20:44:27.273Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [payments](#contract-payments)
- [Ownership matrix](#ownership-matrix)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-payments"></a>
## payments

Source: `src/features/payments/env.schema.ts`
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
| payments-team | [`STRIPE_KEY` (payments)](#payments-stripe_key) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `STRIPE_KEY` | [payments (`src/features/payments/env.schema.ts`)](#payments-stripe_key) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`STRIPE_KEY`](#payments-stripe_key) | payments-team | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 1
- Total variable declarations: 1 (1 from active contracts)
- Unique variable names: 1
- Variables with `expiresAt` set: 0
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 1
- Variables with refresh instructions: 0
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
