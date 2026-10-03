# Docs/ownership-report generator

Generates `docs/ENVIRONMENT.md` (the rich Markdown catalog), `docs/OWNERSHIP.md` (the dependency & ownership report), and `.env.example` — what `env-cap --docs`/`--ownership`/`--env-example` used to write for this example before those flags were removed from the CLI surface. See [ADR 0046](../../../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md) for why: none of the three has a real *runtime* consumer the way the generated manifest does (`src/startup.ts` `import`s `src/generated/env.manifest.ts` and passes it to `validateEnv()`; nothing in this app reads `docs/ENVIRONMENT.md`), so generating them is application-level code now, not a CLI concern.

## What it calls

[`run.ts`](run.ts) imports `generateDocumentation`/`generateUsageReport` directly from `@maverickcer/env-cap/build` (both fully exported, Stable per [ADR 0045](../../../../specs/decisions/0045-promote-experimental-surfaces-to-stable.md)) — the same orchestrators the removed `--docs`/`--ownership` CLI flags called internally, just invoked directly instead of through argv parsing.

[`check.ts`](check.ts) is the `--check` counterpart, via the same package's exported `checkEnvArtifacts()` — the removed `env-cap --check --docs --ownership --env-example` combination's own function, called directly with the same options `run.ts` passes to `generateDocumentation()`/`generateUsageReport()`. `npm run check` (see `package.json`) runs `env-cap --check` (manifest + evidence — the two outputs with a real consumer/contract) and then this script (docs/ownership/env-example), so every artifact this example generates is still drift-checked, split across the same CLI/application-code boundary as generation itself. This is what keeps `test/examples/application.test.ts`'s `checkArtifactsFresh()` assertion accurate.

This intentionally does **not** parse `docs/env.evidence.json`. That file is a separate, versioned projection (`EvidenceModel`/`ContractModel` — see ADR 0038) of the same underlying analysis, not the raw `DiscoveredContract[]`/`ImportResolutionContext` shape `generateDocumentation()`/`generateUsageReport()`/`checkEnvArtifacts()` need, and the internal pass that produces that raw shape (`assembleProject()`/`computeScanSurface()`) is deliberately not part of `@maverickcer/env-cap/build`'s public surface (ADR 0010's "engine internals stay private" precedent). So each function here runs its own real discovery+link pass — exactly what the removed CLI flags did under the hood — rather than trying to reconstruct that pass from the JSON artifact.

## Running it

```bash
npm run docs:reports   # generate
npm run check           # verify (manifest + evidence via the CLI, docs/ownership/env-example via check.ts)
```

`docs:reports` chains `npm run docs` first (regenerates `src/generated/env.manifest.ts` and `docs/env.evidence.json` via the `env-cap` CLI) so the evidence artifact this script runs alongside is always current. `npm run typecheck`/`npm start` chain `docs:reports` too — see `package.json`.

## Precedent

Matches `examples/nextjs-app/scripts/generate-docs` and `examples/team-service/scripts/generate-docs`'s own identical pattern — all three examples this change touched follow the same split.
