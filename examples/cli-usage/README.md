# CLI usage example

`examples/basic-node`'s exact contract (`src/env.ts`, `src/server.ts`, `src/startup.ts` are all
identical, minus `STRIPE_KEY`'s `expiresAt`/`refreshInstructions` -- see `src/env.ts`'s header
comment for why), but generated entirely differently: every other example calls
`generateEnvArtifacts()` from its own `scripts/generate-manifest.mjs`; this one has no such
script at all. Every `package.json` script here invokes the packaged `env-cap` binary directly:

```
src/
  env.ts                   <- same contract as basic-node
  generated/
    env.manifest.ts        <- generated, do not edit
    env.manifest.snapshot.json  <- generated, do not edit (see ADR 0021)
  startup.ts
  server.ts
docs/
  ENVIRONMENT.md            <- generated
  OWNERSHIP.md              <- generated
```

There is no `scripts/` directory here on purpose.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

`npm start` runs `npm run generate:env` (the CLI binary, not a script) and then boots
`src/server.ts`, exactly like `examples/basic-node`.

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

`generate:env` also passes `--env-example-on-existing overwrite`, so re-running it regenerates
`.env.example` in place every time rather than leaving a timestamped sibling next to it (the
CLI's default) -- see the root README's CLI section for the three available modes.

## Why this example exists

`generateEnvArtifacts()` (and the standalone `generateEnvManifest()`/`generateDocumentation()`/
`generateUsageReport()`) are all usable as plain library calls, which is what every other example
here does. But `env-cap` also ships as an installable CLI binary (`npx env-cap`, or a
`package.json` script like the ones above) -- for a team that would rather wire generation into
`package.json` directly than maintain a custom `.mjs` orchestration script. This example proves
that path end-to-end: the packaged `bin` entry resolves, and its output is byte-for-byte
identical to what the equivalent library call would produce.
