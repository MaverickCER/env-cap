# Split generators example

This example uses `examples/application`'s exact contract (`src/env.ts`/`src/server.ts`/
`src/startup.ts` are all identical) but generates it differently. Every other example calls
`generateEnvArtifacts()` once. This one calls the three standalone generator functions it composes
separately, one after another: `generateEnvManifest()`, `generateDocumentation()`,
`generateUsageReport()`. See `scripts/generate-manifest.mjs`.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

The generated artifacts (`src/generated/env.manifest.ts`, `docs/ENVIRONMENT.md`, `.env.example`,
`docs/OWNERSHIP.md`) are byte-for-byte identical to what `examples/application`'s single
`generateEnvArtifacts()` call produces for the same contract. Both ultimately call the same
underlying `renderManifest()`/`renderDocs()`/`renderUsageReport()` functions.

## The real trade-off this demonstrates

Calling the three standalone functions separately means **three independent discovery/link
passes** instead of one shared pass. `generateEnvArtifacts()` (ADR 0011) exists specifically to
share one discovery-and-link pass across every requested output. Each of
`generateEnvManifest()`/`generateDocumentation()`/`generateUsageReport()` re-parses the schema
files from scratch. For a small project like this one, the difference is invisible. For a large
monorepo with hundreds of `env.schema.ts` files, it's real, repeated work.

Each standalone function also throws its **own specific error type** on a blocking finding:
`EnvManifestGenerationError`, `EnvDocumentationGenerationError`, or `EnvUsageAnalysisError`. It
does not throw the aggregated `EnvProjectGenerationError` that `generateEnvArtifacts()` throws
covering all three passes at once.

This example is not the recommended default. It exists for two kinds of callers:

- callers who only ever need one pass (e.g. only the manifest, for a runtime-only deployment with
  no docs site);
- callers who want different passes running on different schedules or in different CI steps. For
  example, the ownership report runs only on a nightly job and the manifest on every commit.

For most projects, prefer `generateEnvArtifacts()`, the way every other example here does.
