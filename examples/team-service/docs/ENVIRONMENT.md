<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-23T19:31:48.509Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [auth](#contract-auth)
  - [mongodb](#contract-mongodb)
  - [postgres](#contract-postgres)
  - [prisma](#contract-prisma)
- [Ownership matrix](#ownership-matrix)
- [Dependency graph](#dependency-graph)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-auth"></a>
## auth

Source: `features/auth/env.schema.ts`
- Active: yes
- Category: auth
- Owner: security-team

<a id="auth-session_secret"></a>
### `SESSION_SECRET`

Signs and verifies user session cookies.

- Default: no
- Processor: no
- Validator: no
- Owner: security-team
- Sensitivity: secret
- Expires: 2026-10-01
- Setup instructions: Generate with `openssl rand -base64 32`; security-team keeps the canonical copy in the shared vault.
- Refresh instructions: Rotate via the vault, then redeploy -- existing sessions are invalidated on rotation, so schedule outside peak hours.
- Required: yes

<a id="contract-mongodb"></a>
## mongodb

Source: `features/mongodb/env.schema.ts`
- Active: no
- Category: database
- Exclusive group: database
- Owner: data-platform-team
- Runbook: https://wiki.internal/runbooks/mongodb-failover

<a id="mongodb-database_url"></a>
### `DATABASE_URL`

MongoDB connection string.

- Default: no
- Processor: yes
- Validator: no
- Owner: data-platform-team

<a id="mongodb-mongodb_replica_set"></a>
### `MONGODB_REPLICA_SET`

MongoDB replica set name -- no Postgres equivalent.

- Default: yes
- Processor: no
- Validator: no
- Owner: data-platform-team

<a id="contract-postgres"></a>
## postgres

Source: `features/postgres/env.schema.ts`
- Active: yes
- Category: database
- Exclusive group: database
- Owner: data-platform-team
- Runbook: https://wiki.internal/runbooks/postgres-failover

<a id="postgres-database_url"></a>
### `DATABASE_URL`

Postgres connection string.

- Default: no
- Processor: yes
- Validator: no
- Owner: security-team
- Sensitivity: secret
- Expires: 2026-10-15
- Setup instructions: Request a scoped database credential from security-team's vault (see the runbook); do not reuse another service's connection string.
- Refresh instructions: security-team rotates this credential quarterly via the vault; data-platform-team just needs to redeploy after a rotation lands.

<a id="contract-prisma"></a>
## prisma

Source: `features/prisma/env.schema.ts`
- Active: yes
- Category: orm
- Owner: data-platform-team
- Docs: https://www.prisma.io/docs/orm/reference/connection-urls

<a id="prisma-database_provider"></a>
### `DATABASE_PROVIDER`

Which database provider Prisma should target.

- Default: no
- Processor: no
- Validator: yes
- Owner: data-platform-team

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| data-platform-team | [`DATABASE_URL` (mongodb)](#mongodb-database_url), [`MONGODB_REPLICA_SET` (mongodb)](#mongodb-mongodb_replica_set), [`DATABASE_PROVIDER` (prisma)](#prisma-database_provider) |
| security-team | [`SESSION_SECRET` (auth)](#auth-session_secret), [`DATABASE_URL` (postgres)](#postgres-database_url) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `DATABASE_PROVIDER` | [prisma (`features/prisma/env.schema.ts`)](#prisma-database_provider) |
| `DATABASE_URL` | [mongodb (`features/mongodb/env.schema.ts`)](#mongodb-database_url), [postgres (`features/postgres/env.schema.ts`)](#postgres-database_url) |
| `MONGODB_REPLICA_SET` | [mongodb (`features/mongodb/env.schema.ts`)](#mongodb-mongodb_replica_set) |
| `SESSION_SECRET` | [auth (`features/auth/env.schema.ts`)](#auth-session_secret) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`SESSION_SECRET`](#auth-session_secret) | security-team | 2026-10-01 (**8d remaining**) | Rotate via the vault, then redeploy -- existing sessions are invalidated on rotation, so schedule outside peak hours. |
| [`DATABASE_URL`](#mongodb-database_url) | data-platform-team | -- | -- |
| [`MONGODB_REPLICA_SET`](#mongodb-mongodb_replica_set) | data-platform-team | -- | -- |
| [`DATABASE_URL`](#postgres-database_url) | security-team | 2026-10-15 (**22d remaining**) | security-team rotates this credential quarterly via the vault; data-platform-team just needs to redeploy after a rotation lands. |
| [`DATABASE_PROVIDER`](#prisma-database_provider) | data-platform-team | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 4
- Total variable declarations: 5 (3 from active contracts)
- Unique variable names: 4
- Variables with `expiresAt` set: 2
  - Already expired: 0
  - Expiring within 30 days: 2
- Variables marked `required: true`: 1
- Variables with refresh instructions: 2
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 1
- Undocumented contracts: 0
- Undocumented variables: 0
