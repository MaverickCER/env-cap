<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->

# Dependency & Ownership Report

Which feature owns each variable, which features consume that contract, and what the blast radius is if it changes.

## Dependency ownership

Who owns each contract, who depends on it, and the blast radius if it changes.

| Contract | Owner | Variables | Consumers | Blast radius |
|---|---|---|---|---|
| mongodb (`features/mongodb/env.schema.ts`) | Data Platform team | 2 | -- | 0 |
| postgres (`features/postgres/env.schema.ts`) | Data Platform team | 1 | src/app.ts | 1 |
| prisma (`features/prisma/env.schema.ts`) | Data Platform team | 1 | src/app.ts | 1 |

## Abandoned ownership

Contracts never imported anywhere in the scanned repository -- a feature's schema outliving the feature.

| Contract | Owner | File |
|---|---|---|
| mongodb | Data Platform team | `features/mongodb/env.schema.ts` |
