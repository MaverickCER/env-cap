# Build-time performance benchmark

Measures discovery, parsing/linking, and manifest/documentation/usage-report generation cost as
monorepo size scales. See [`../PERFORMANCE.md`](../PERFORMANCE.md) for full methodology, tier
definitions, and the "never compare" rules. This README covers only what's specific to this
example.

## Run it

```bash
npm install
npm run build --prefix ../.. # generateEnvArtifacts()'s parsing needs a built dist/ to run against typescript's own resolution the same way any real consumer would
npm run benchmark
```

Writes `results.json` and `RESULTS.md`, both committed. `fixtures/` (both the generated `.ts`
schema trees and scratch output from generation runs) is gitignored -- only `edge-cases/` is
hand-authored and committed.

## What's measured

Six named benchmarks:

- **`artifacts`** (tiered `baseline`/`stress`/`extreme`/`enterprise`) -- the flagship number:
  `generateEnvArtifacts()`'s full cost (one shared discovery+link pass, per ADR 0011, plus three
  renders). `discoveryMs` alongside it is measured by a *separate* `discoverSchemaFiles()` call
  against the same fixtures -- not extracted from `generateEnvArtifacts()`'s own internal pass,
  which is intentionally not public API -- so it's close to, but not exactly, an internal phase
  split of the same run. Useful for localizing a regression to "the walk" vs. "parse/render"
  without profiling.
- **`discovery`** (tiered) -- `discoverSchemaFiles()` alone. Filesystem-traversal-bound,
  independent of per-file content.
- **`standalone-vs-combined`** (fixed `stress` tier) -- the three standalone generators
  (`generateEnvManifest`/`generateDocumentation`/`generateUsageReport`), each independently
  re-discovering, summed and compared against one `generateEnvArtifacts()` call. Directly
  validates ADR 0011's shared-pass design.
- **`documentation-payload`** (fixed `stress`-sized fixture, two variants) -- minimal
  descriptions vs. long multi-paragraph descriptions plus several custom `documentEnv()` fields,
  at the *same* variable count. Isolates documentation payload size as its own cost driver,
  independent of variable count (see `../PERFORMANCE.md`).
- **`scoped-include`** (fixed `extreme` tier) -- `generateEnvManifest({ include: [...one contract...] })`
  vs. the full tree, with discovery-walk time and parse/render time reported *separately*: `include`
  filters after the walk completes, not during it, so only the parse/render component should
  shrink.
- **`edge-cases`** (fixed, small, committed `edge-cases/`) -- a valid baseline, an excluded
  directory, a non-exported `createEnv()` call, a computed/template-literal key, and an
  eight-levels-deep nested schema. Confirms predictable behavior and correct warnings, not "how
  fast."

Considered and cut from this suite: `manifest`/`documentation`/`usage` as full tier ladders each
(near-duplicate of `discovery`'s own cost, three times over), and AST parsing in isolation
(`parseSchemaFile()` is internal, not public API). See `../PERFORMANCE.md`.
