<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-11T07:50:21.428Z_

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

> Validation contexts describe when validation participates. They do not restrict access to values, and they do not remove a variable's schema (or its `default` value) from wherever this manifest is imported.

<a id="contract-app"></a>
## app

Source: `features/app/env.schema.ts`
- Active: yes

<a id="app-database_url"></a>
### `DATABASE_URL`

Postgres connection string. Server-only: never read from a browser bundle.

- Default: no
- Processor: yes
- Validator: yes
- Validation context: server
- Owner: team-platform
- Required: yes

<a id="app-log_level"></a>
### `LOG_LEVEL`

Log verbosity. No validation context -- read by both the server and the client bundle.

- Default: yes
- Processor: yes
- Validator: no
- Owner: team-platform

<a id="app-public_api_url"></a>
### `PUBLIC_API_URL`

Public API base URL. Safe to expose to the browser.

- Default: no
- Processor: yes
- Validator: yes
- Validation context: client
- Owner: team-platform
- Required: yes

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| team-platform | [`DATABASE_URL` (app)](#app-database_url), [`LOG_LEVEL` (app)](#app-log_level), [`PUBLIC_API_URL` (app)](#app-public_api_url) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `DATABASE_URL` | [app (`features/app/env.schema.ts`)](#app-database_url) |
| `LOG_LEVEL` | [app (`features/app/env.schema.ts`)](#app-log_level) |
| `PUBLIC_API_URL` | [app (`features/app/env.schema.ts`)](#app-public_api_url) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`DATABASE_URL`](#app-database_url) | team-platform | -- | -- |
| [`LOG_LEVEL`](#app-log_level) | team-platform | -- | -- |
| [`PUBLIC_API_URL`](#app-public_api_url) | team-platform | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 1
- Total variable declarations: 3 (3 from active contracts)
- Unique variable names: 3
- Variables with `expiresAt` set: 0
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 2
- Variables with refresh instructions: 0
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
