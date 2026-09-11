<!-- AUTO-GENERATED FILE. DO NOT EDIT. -->

# Dependency & Ownership Report

Which feature owns each variable, which features consume that contract, and what the blast radius is if it changes.

## Dependency ownership

Who owns each contract, who depends on it, and the blast radius if it changes.

| Contract | Owner | Variables | Consumers | Blast radius |
|---|---|---|---|---|
| app (`src/env.ts`) | platform-team | 5 | src/server.ts | 1 |

## Unconsumed owned dependencies

Variables no consumer reads within the scanned repository. Not proof of dead code -- an out-of-repo caller (a separate service, a webhook handler) would still show up here.

| Variable | Contract | Owner |
|---|---|---|
| `DATABASE_URL` | app | platform-team |
| `STRIPE_KEY` | app | platform-team |
