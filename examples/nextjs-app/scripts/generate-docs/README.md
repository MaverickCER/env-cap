# Docs/ownership-report generator

Generates `docs/ENVIRONMENT.md` (the rich Markdown catalog), `docs/OWNERSHIP.md` (the dependency & ownership report), and `.env.example` — what `env-cap --docs`/`--ownership`/`--env-example` used to write for this example before those flags were removed from the CLI surface. See [ADR 0046](../../../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md) for why: none of the three has a real *runtime* consumer the way the generated manifest does (`src/env.ts` `import`s `src/generated/env.manifest.ts` and passes it to `validateEnv()`; nothing in this app reads `docs/ENVIRONMENT.md`), so generating them is application-level code now, not a CLI concern.

## What it calls

[`run.ts`](run.ts) imports `generateDocumentation`/`generateUsageReport` directly from `env-cap/build` (both fully exported, Stable per [ADR 0045](../../../../specs/decisions/0045-promote-experimental-surfaces-to-stable.md)) — the same orchestrators the removed `--docs`/`--ownership` CLI flags called internally, just invoked directly instead of through argv parsing.

[`check.ts`](check.ts) is the `--check` counterpart, via the same package's exported `checkEnvArtifacts()` — the removed `env-cap --check --docs --ownership --env-example` combination's own function, called directly with the same options `run.ts` passes to `generateDocumentation()`/`generateUsageReport()`. `npm run check` (see `package.json`) runs `env-cap --check` (manifest + evidence — the two outputs with a real consumer/contract) and then this script (docs/ownership/env-example), so every artifact this example generates is still drift-checked, split across the same CLI/application-code boundary as generation itself.

This intentionally does **not** parse `docs/env.evidence.json`. That file is a separate, versioned projection (`EvidenceModel`/`ContractModel` — see ADR 0038) of the same underlying analysis, not the raw `DiscoveredContract[]`/`ImportResolutionContext` shape `generateDocumentation()`/`generateUsageReport()` need, and the internal pass that produces that raw shape (`assembleProject()`/`computeScanSurface()`) is deliberately not part of `env-cap/build`'s public surface (ADR 0010's "engine internals stay private" precedent, matching the dependency-ownership engine's other internals). So each orchestrator here runs its own real discovery+link pass — exactly what the removed CLI flags did under the hood — rather than trying to reconstruct that pass from the JSON artifact.

## Running it

```bash
npm run docs:reports
```

which chains `npm run docs` first (regenerates `src/generated/env.manifest.ts` and `docs/env.evidence.json`) so the evidence artifact this script runs alongside is always current, then runs this script. `npm run build`/`npm run dev`/`npm run typecheck` all chain `docs:reports` too — see `package.json`.

## Precedent

`examples/nextjs-app/scripts/open-config-alignment` (removed for an unrelated reason — see git history) was the sibling pattern for a script that genuinely *does* project over already-persisted `docs/env.evidence.json`, via `env-cap`'s published reference evidence projections (`configurationReference`, `ownershipSummary`, `expiringSoonReport`). That pattern fits a projection over already-computed evidence; it doesn't fit here, since `generateDocumentation()`/`generateUsageReport()` need the richer, pre-projection discovery shape evidence.json deliberately doesn't carry.
