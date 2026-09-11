<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Dependency & Ownership Report

_Produced by `env-cap --ownership`._

Which feature owns each variable, which features consume that contract, and what the blast radius is if it changes.

## Dependency ownership

Who owns each contract, who depends on it, and the blast radius if it changes.

| Contract | Owner | Variables | Consumers | Blast radius |
|---|---|---|---|---|
| auth (`features/auth/env.schema.ts`) | security-team | 1 | src/app.ts | 1 |
| mongodb (`features/mongodb/env.schema.ts`) | data-platform-team | 2 | -- | 0 |
| postgres (`features/postgres/env.schema.ts`) | data-platform-team | 1 | src/app.ts | 1 |
| prisma (`features/prisma/env.schema.ts`) | data-platform-team | 1 | src/app.ts | 1 |

## Abandoned ownership

Contracts never imported anywhere in the scanned repository -- a feature's schema outliving the feature.

| Contract | Owner | File |
|---|---|---|
| mongodb | data-platform-team | `features/mongodb/env.schema.ts` |
