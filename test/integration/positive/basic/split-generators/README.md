# Split generators example

`examples/application`'s exact contract (`src/env.ts`/`src/server.ts`/`src/startup.ts` are all
identical), but generated differently: every other example calls `generateEnvArtifacts()` once;
this one calls the three standalone generator functions it composes -- `generateEnvManifest()`,
`generateDocumentation()`, `generateUsageReport()` -- separately, one after another. See
`scripts/generate-manifest.mjs`.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

The generated artifacts (`src/generated/env.manifest.ts`, `docs/ENVIRONMENT.md`, `.env.example`,
`docs/OWNERSHIP.md`) are byte-for-byte identical to what `examples/application`'s single
`generateEnvArtifacts()` call produces for the same contract -- both ultimately call the same
underlying `renderManifest()`/`renderDocs()`/`renderUsageReport()` functions.

## The real trade-off this demonstrates

`generateEnvArtifacts()` (ADR 0011) exists specifically to share one discovery-and-link pass
across every requested output. Calling the three standalone functions separately, as this example
does, means **three independent discovery/link passes** instead of one shared pass -- each of
`generateEnvManifest()`/`generateDocumentation()`/`generateUsageReport()` re-parses the schema
files from scratch. For a small project like this one, the difference is invisible; for a large
monorepo with hundreds of `env.schema.ts` files, it's real, repeated work.

Each standalone function also throws its **own specific error type** on a blocking finding --
`EnvManifestGenerationError`, `EnvDocumentationGenerationError`, or `EnvUsageAnalysisError` --
rather than the aggregated `EnvProjectGenerationError` `generateEnvArtifacts()` throws covering
all three passes at once.

This example exists for callers who only ever need one pass (e.g. just the manifest, for a
runtime-only deployment with no docs site), or who want different passes running on different
schedules or in different CI steps (e.g. the ownership report only on a nightly job, the manifest
on every commit) -- not as the recommended default. For most projects, prefer
`generateEnvArtifacts()`, the way every other example here does.
