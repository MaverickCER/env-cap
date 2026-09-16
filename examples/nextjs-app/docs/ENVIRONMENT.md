<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-16T05:38:02.636Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [todos-public](#contract-todos-public)
  - [todos-server](#contract-todos-server)
- [Ownership matrix](#ownership-matrix)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-todos-public"></a>
## todos-public

Source: `src/features/todos/env.public.schema.ts`
- Active: yes
- Owner: platform-team

<a id="todos-public-next_public_app_name"></a>
### `NEXT_PUBLIC_APP_NAME`

Display name shown in the todo app's header. Safe to ship to the browser -- never move a secret into this file to reuse its NEXT_PUBLIC_ wiring.

- Default: yes
- Processor: yes
- Validator: no
- Owner: platform-team
- Sensitivity: config

<a id="contract-todos-server"></a>
## todos-server

Source: `src/features/todos/env.server.schema.ts`
- Active: yes
- Owner: platform-team

<a id="todos-server-database_url"></a>
### `DATABASE_URL`

Connection string for the todo store. This example's actual storage is in-memory (see src/lib/store.ts) -- the variable is still declared, validated, and documented for real, exactly as a production DATABASE_URL would be.

- Default: no
- Processor: no
- Validator: yes
- Owner: platform-team
- Sensitivity: secret
- Setup instructions: Provision a datastore and paste its connection string.
- Required: yes

<a id="todos-server-internal_api_key"></a>
### `INTERNAL_API_KEY`

Shared secret required on the internal admin API route (src/app/api/todos/route.ts's DELETE handler).

- Default: no
- Processor: no
- Validator: yes
- Owner: platform-team
- Sensitivity: credential
- Setup instructions: Generate any non-empty random string for local development.
- Required: yes

<a id="todos-server-session_secret"></a>
### `SESSION_SECRET`

Signs the demo session cookie that distinguishes one browser session from another.

- Default: no
- Processor: no
- Validator: yes
- Owner: platform-team
- Sensitivity: secret
- Setup instructions: Generate 32+ random bytes, e.g. `openssl rand -base64 32`.
- Required: yes

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| platform-team | [`NEXT_PUBLIC_APP_NAME` (todos-public)](#todos-public-next_public_app_name), [`DATABASE_URL` (todos-server)](#todos-server-database_url), [`INTERNAL_API_KEY` (todos-server)](#todos-server-internal_api_key), [`SESSION_SECRET` (todos-server)](#todos-server-session_secret) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `DATABASE_URL` | [todos-server (`src/features/todos/env.server.schema.ts`)](#todos-server-database_url) |
| `INTERNAL_API_KEY` | [todos-server (`src/features/todos/env.server.schema.ts`)](#todos-server-internal_api_key) |
| `NEXT_PUBLIC_APP_NAME` | [todos-public (`src/features/todos/env.public.schema.ts`)](#todos-public-next_public_app_name) |
| `SESSION_SECRET` | [todos-server (`src/features/todos/env.server.schema.ts`)](#todos-server-session_secret) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`NEXT_PUBLIC_APP_NAME`](#todos-public-next_public_app_name) | platform-team | -- | -- |
| [`DATABASE_URL`](#todos-server-database_url) | platform-team | -- | -- |
| [`INTERNAL_API_KEY`](#todos-server-internal_api_key) | platform-team | -- | -- |
| [`SESSION_SECRET`](#todos-server-session_secret) | platform-team | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 2
- Total variable declarations: 4 (4 from active contracts)
- Unique variable names: 4
- Variables with `expiresAt` set: 0
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 3
- Variables with refresh instructions: 0
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
