<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->

# Environment Variables

_Generated 2026-08-03T23:32:00.508Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [mongodb](#contract-mongodb)
  - [postgres](#contract-postgres)
  - [prisma](#contract-prisma)
- [Ownership matrix](#ownership-matrix)
- [Dependency graph](#dependency-graph)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-mongodb"></a>
## mongodb

Source: `features/mongodb/env.schema.ts`
- Active: no
- Category: database
- Exclusive group: database
- Owner: Data Platform team
- Runbook: https://wiki.internal/runbooks/mongodb-failover

<a id="mongodb-database_url"></a>
### `DATABASE_URL`

MongoDB connection string.

- Default: no
- Processor: yes
- Validator: no
- Owner: Data Platform team

<a id="mongodb-mongodb_replica_set"></a>
### `MONGODB_REPLICA_SET`

MongoDB replica set name -- no Postgres equivalent.

- Default: yes
- Processor: no
- Validator: no
- Owner: Data Platform team

<a id="contract-postgres"></a>
## postgres

Source: `features/postgres/env.schema.ts`
- Active: yes
- Category: database
- Exclusive group: database
- Owner: Data Platform team
- Runbook: https://wiki.internal/runbooks/postgres-failover

<a id="postgres-database_url"></a>
### `DATABASE_URL`

Postgres connection string.

- Default: no
- Processor: yes
- Validator: no
- Owner: Data Platform team

<a id="contract-prisma"></a>
## prisma

Source: `features/prisma/env.schema.ts`
- Active: yes
- Category: orm
- Owner: Data Platform team
- Docs: https://www.prisma.io/docs/orm/reference/connection-urls

<a id="prisma-database_provider"></a>
### `DATABASE_PROVIDER`

Which database provider Prisma should target.

- Default: no
- Processor: no
- Validator: yes
- Owner: Data Platform team

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| Data Platform team | [`DATABASE_URL` (mongodb)](#mongodb-database_url), [`MONGODB_REPLICA_SET` (mongodb)](#mongodb-mongodb_replica_set), [`DATABASE_URL` (postgres)](#postgres-database_url), [`DATABASE_PROVIDER` (prisma)](#prisma-database_provider) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `DATABASE_PROVIDER` | [prisma (`features/prisma/env.schema.ts`)](#prisma-database_provider) |
| `DATABASE_URL` | [mongodb (`features/mongodb/env.schema.ts`)](#mongodb-database_url), [postgres (`features/postgres/env.schema.ts`)](#postgres-database_url) |
| `MONGODB_REPLICA_SET` | [mongodb (`features/mongodb/env.schema.ts`)](#mongodb-mongodb_replica_set) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`DATABASE_URL`](#mongodb-database_url) | Data Platform team | -- | -- |
| [`MONGODB_REPLICA_SET`](#mongodb-mongodb_replica_set) | Data Platform team | -- | -- |
| [`DATABASE_URL`](#postgres-database_url) | Data Platform team | -- | -- |
| [`DATABASE_PROVIDER`](#prisma-database_provider) | Data Platform team | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 3
- Total variable declarations: 4 (2 from active contracts)
- Unique variable names: 3
- Variables with `expiresAt` set: 0
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 0
- Variables with refresh instructions: 0
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 1
- Undocumented contracts: 0
- Undocumented variables: 0
