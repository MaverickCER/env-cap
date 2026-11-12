# Docs and ownership-report generator

Writes `docs/ENVIRONMENT.md` (the variable catalog), `docs/OWNERSHIP.md` (the dependency and ownership report) and `.env.example` for this example.

The CLI writes only the manifest and the evidence file, because only those have a runtime or evidence consumer ([ADR 0046](../../../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)). These three files come from application code instead.

## What it calls

- [`run.ts`](run.ts) calls `generateDocumentation()` and `generateUsageReport()` from `@maverickcer/env-cap/build`.
- [`check.ts`](check.ts) calls `checkEnvArtifacts()` with the same options, and writes nothing.

Each call runs its own discovery pass. The scripts do not read `docs/env.evidence.json`, because the evidence model does not carry the discovery shape these functions need ([ADR 0010](../../../../specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)).

## Running it

| Command                | Exit code | Line of output to look for                                                         |
| ---------------------- | --------- | ---------------------------------------------------------------------------------- |
| `npm run docs:reports` | `0`       | `[generate-docs] wrote docs/ENVIRONMENT.md`                                        |
| `npm run check`        | `0`       | `[generate-docs check] docs/ownership artifacts are up to date.`                   |
| `npm run check`        | `1`       | `[generate-docs check] one or more docs/ownership artifacts are stale or missing.` |

`docs:reports` runs `npm run docs` first, so the manifest and evidence file are current. `npm run check` runs `env-cap --check` for those two files, then `check.ts` for the other three.

`test/examples/team-service.test.ts` runs `npm run check` in CI's `examples` job, including a case where it must fail.
