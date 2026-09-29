# CLI usage example

`examples/application`'s exact contract (`src/env.ts`, `src/server.ts`, `src/startup.ts` are all
identical, minus `STRIPE_KEY`'s `expiresAt`/`refreshInstructions` -- see `src/env.ts`'s header
comment for why), but generated entirely differently: every other example calls
`generateEnvArtifacts()` from its own `scripts/generate-manifest.mjs`; this one has no such
script at all. Every `package.json` script here invokes the packaged `env-cap` binary directly:

```
src/
  env.ts                   <- same contract as basic-node
  generated/
    env.manifest.ts        <- generated, do not edit
  startup.ts
  server.ts
docs/
  env.evidence.json          <- generated, do not edit (the full EvidenceModel, see ADR 0038)
  env.evidence.json.fingerprint  <- generated, do not edit (content hash, see ADR 0038)
```

There is no `scripts/` directory here on purpose -- which is also why this fixture only
demonstrates the manifest and the persisted evidence artifact, not
`docs/ENVIRONMENT.md`/`docs/OWNERSHIP.md`/`.env.example`. Those three no longer have CLI flags at
all (`--docs`/`--ownership`/`--env-example` were removed -- see [ADR
0046](../../../../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)); every
example that still generates them does so via a small `scripts/generate-docs/run.ts` calling
`env-cap/build` directly (see e.g. `examples/application/scripts/generate-docs`), which would
defeat this fixture's own "no wrapper script" point if added here. What's left --
`--location`/`--evidence`/`--check`/`--json` -- is exactly the CLI surface ADR 0046 kept, so this
fixture is, if anything, a purer demonstration of it now.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

`npm start` runs `npm run generate:env` (the CLI binary, not a script) and then boots
`src/server.ts`, exactly like `examples/application`.

## The three CLI invocations this example demonstrates

```bash
# Normal (write) mode -- human-readable report on stdout.
npm run generate:env

# --check -- verify the artifacts already on disk are up to date, without writing anything
# (a CI drift guard; see ADR 0016). Run this after generate:env above and it reports "up to date".
npm run verify:env

# --json -- the same generation, as a machine-readable envelope (see ADR 0013) instead of
# formatted text. Conforms to schemas/env-cap-report.schema.json.
npm run generate:env:json
```

## Why this example exists

`generateEnvArtifacts()` (and the standalone `generateEnvManifest()`/`generateDocumentation()`/
`generateUsageReport()`) are all usable as plain library calls, which is what every other example
here does. But `env-cap` also ships as an installable CLI binary (`npx env-cap`, or a
`package.json` script like the ones above) -- for a team that would rather wire generation into
`package.json` directly than maintain a custom `.mjs` orchestration script. This example proves
that path end-to-end: the packaged `bin` entry resolves, and its output is byte-for-byte
identical to what the equivalent library call would produce.
