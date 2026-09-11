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
| auth (`src/capabilities/auth/env.schema.ts`) | security-team | 1 | src/server/services/auth.service.ts | 1 |
| database (`src/capabilities/database/env.schema.ts`) | data-platform-team | 2 | src/server/db/connection.ts | 1 |
| email (`src/capabilities/email/env.schema.ts`) | platform-team | 2 | src/server/services/email.service.ts | 1 |
| oauth-github (`src/capabilities/oauth-github/env.schema.ts`) | security-team | 2 | src/server/functions/auth.ts | 1 |
| observability (`src/capabilities/observability/env.schema.ts`) | platform-team | 2 | src/server/services/observability.service.ts | 1 |
| storage (`src/capabilities/storage/env.schema.ts`) | compliance-team | 5 | src/server/services/storage.service.ts | 1 |

## Unconsumed owned dependencies

Variables no consumer reads within the scanned surfaces below. Not proof of dead code. Common reasons a real consumer wouldn't show up here: it's read by a separate, out-of-repo service or webhook handler; it's consumed by non-TypeScript code (a shell script, a Dockerfile, a Terraform/Kubernetes manifest); or it's read from an allow-listed package whose directory wasn't included in this project's own `packages` configuration (ADR 0014).

Searched: application.

A blank Stale/missing citations cell is the strongest "looks genuinely unused" signal -- no developer has ever claimed otherwise. A non-blank cell means someone specifically claimed dynamic access here via `dynamicAccess`, and that claim can no longer be verified (ADR 0037) -- check with them before deleting.

| Variable | Contract | Owner | Stale/missing citations |
|---|---|---|---|
| `AUDIT_LOG_RETENTION_DAYS` | database | data-platform-team | -- |
