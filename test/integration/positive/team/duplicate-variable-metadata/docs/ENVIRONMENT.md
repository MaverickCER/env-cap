<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-26T17:47:31.916Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [audit-log](#contract-audit-log)
  - [notifications](#contract-notifications)
- [Ownership matrix](#ownership-matrix)
- [Dependency graph](#dependency-graph)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-audit-log"></a>
## audit-log

Source: `features/audit-log/env.schema.ts`
- Active: yes

<a id="audit-log-webhook_url"></a>
### `WEBHOOK_URL`

Webhook endpoint audit events are POSTed to.

- Default: no
- Processor: no
- Validator: no
- Owner: team-security
- Expires: 2027-01-01

<a id="contract-notifications"></a>
## notifications

Source: `features/notifications/env.schema.ts`
- Active: yes

<a id="notifications-webhook_url"></a>
### `WEBHOOK_URL`

Slack webhook for notification delivery.

- Default: no
- Processor: no
- Validator: no
- Owner: team-notifications
- Required: yes

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| team-notifications | [`WEBHOOK_URL` (notifications)](#notifications-webhook_url) |
| team-security | [`WEBHOOK_URL` (audit-log)](#audit-log-webhook_url) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `WEBHOOK_URL` | [audit-log (`features/audit-log/env.schema.ts`)](#audit-log-webhook_url), [notifications (`features/notifications/env.schema.ts`)](#notifications-webhook_url) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`WEBHOOK_URL`](#audit-log-webhook_url) | team-security | 2027-01-01 | -- |
| [`WEBHOOK_URL`](#notifications-webhook_url) | team-notifications | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 2
- Total variable declarations: 2 (2 from active contracts)
- Unique variable names: 1
- Variables with `expiresAt` set: 1
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 1
- Variables with refresh instructions: 0
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 1
- Undocumented contracts: 0
- Undocumented variables: 0
