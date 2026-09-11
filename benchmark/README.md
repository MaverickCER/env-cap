# Benchmarks

[`performance-runtime/`](performance-runtime/) and [`performance-buildtime/`](performance-buildtime/)
are project confidence tooling, not adoption samples like the flagships under
[`examples/`](../examples/) — they exist to answer "does this scale," "did this regress," and "did
that architectural decision actually pay off," for maintainers and prospective adopters evaluating
env-cap at monorepo scale. Run via `npm run benchmark` from the repo root, or `npm run benchmark`
inside either directory.

[`benchmark-fixtures/`](benchmark-fixtures/) is shared support code the two benchmark scripts
import from — plain `.mjs`, no `package.json` of its own, never run directly.

This file is the canonical documentation for both directories' shared methodology; each one's own
README covers what's specific to it.

## Philosophy

These benchmarks exist to answer three kinds of question: how does env-cap scale as a project
grows, does a change regress that scaling, and do specific architectural decisions (ADR 0011's
shared discovery pass, in particular) actually pay off. They are **not** meant to win synthetic
benchmark contests, prove an absolute performance guarantee, or gate a merge. Every benchmark here
maps to a real, currently-existing code path and a question a real user or maintainer would
actually ask — see the design rationale below for what was deliberately left out and why.

## Tiers

`baseline`/`stress`/`extreme` are a deliberately uniform scaling ladder — three points make a
curve, so a regression that changes the _shape_ of the cost curve (not just its slope) is
visible. `enterprise` is a separate, non-uniform realism spot-check.

| Tier         | Contracts                                            | Vars/contract       | Total vars                               | Purpose                                                                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `baseline`   | 10                                                   | 10                  | 100                                      | Fast-feedback sanity point, small enough for every local `npm run benchmark`; also establishes the constant process-boot floor `cold-start` needs subtracted out before reading its per-variable slope.                                                            |
| `stress`     | 100                                                  | 10                  | 1,000                                    | Mid-ladder point establishing whether cost is linear between `baseline` and `extreme`; the fixed tier used for `standalone-vs-combined` and `documentation-payload`.                                                                                               |
| `extreme`    | 800                                                  | 10                  | 8,000                                    | Top of the synthetic scaling ladder — deliberately uniform, not realistic, so any curve deviation is attributable to size alone, not distribution shape. The fixed tier for `scoped-include`, since it's large enough to make the discovery/parse split visible.   |
| `enterprise` | 250, non-uniform (tiny/medium/large/huge archetypes) | varies by archetype | ~2,500 (computed per run, not hardcoded) | Realism spot-check, not a scaling-ladder point — validates that an idiomatically-authored, non-uniform real-world shape (many distinct processor/validator combinations, uneven contract sizes) doesn't hit a pathological case the uniform tiers wouldn't reveal. |

**Determinism**: fixture generation is a pure function of contract/variable index —
`fixtureSeed: "deterministic-index-v1"` (recorded in every result's metadata) names the strategy
explicitly. Zero `Math.random()`, zero timestamp-seeded anything, anywhere in
`benchmark-fixtures/generator.mjs`. Proven, not just asserted: `fixtureHash` (SHA-256 over every
generated file's relative path + content, sorted) lets two runs against the same
`generatorVersion` be checked for an identical hash.

## Runtime fixture design

Runtime and build-time fixtures share tier _shape_ (contract count, variables-per-contract) but
deliberately diverge on variable _content_:

- **Build-time** fixtures use realistic, varied processors/validators — a JSON-credential shape
  for the uniform tiers, ten idiomatic archetypes for `enterprise` — as literal TypeScript source
  text. AST-parsing cost genuinely depends on source-text volume and variety, and build tooling
  never executes a discovered schema file (ADR 0002), so this realism costs nothing at
  measurement time.
- **Runtime** fixtures give every variable a trivial identity processor and no validator, written
  as plain `.mjs` rather than `.ts` (no transpilation step between "process starts" and "createEnv
  runs"). Processors and validators are extension points — their execution cost belongs to the
  application that supplies them, not to env-cap's own architecture. If runtime fixtures used the
  same realistic processor/validator as build-time's, a regression in `cold-start` could mean
  either "env-cap's own dispatch got slower" or "the fixture's chosen processor got costlier," with
  no way to tell which. Using an identity processor and no validator removes that confound without
  making the measurement meaningless: `validateEnv()`'s loop still does real, measurable,
  O(variables) work even with a trivial callback — a property lookup, a function-call dispatch, a
  `Map` insert per variable — so `cold-start` still isolates something real: env-cap's own
  per-variable bookkeeping cost, cleanly separated from application logic.

## What's measured, and why

### Runtime — `cold-start`

A fresh child process imports a tier's generated contracts (triggering `createEnv()` for each, as
a side effect of module evaluation — see
[`application/src/env.ts`](../examples/application/src/env.ts)) and then runs one `validateEnv()`
call. Each sample is a brand-new process — zero warmup by construction, since a cold process can't
be "warmed." The parent measures total wall-clock time per spawn; the child self-reports how much
of that was its own `createEnv` phase vs. its own `validateEnv` phase. `totalMs` minus
`createEnvMs + validateEnvMs` is the residual process-boot/module-resolution floor — Node startup
and this script's own static imports, not env-cap's cost, but worth keeping visible rather than
silently absorbed into one of the other two fields.

### Build-time — `artifacts`, `discovery`, `standalone-vs-combined`, `documentation-payload`, `scoped-include`, `edge-cases`

See [`performance-buildtime/README.md`](performance-buildtime/README.md) for what each measures.
Runtime and build-time are measured in separate examples (mirrors ADR 0001's runtime/build-time
architectural split), never compared against each other (see "Never compare" below).

## How regressions are surfaced

`budgets.mjs` defines a `maxRegressionPercent` per named benchmark (`cold-start`: 10%, `artifacts`/
`discovery`: 15%). This is a **highlighting** threshold only, checked by
`scripts/render-benchmark-summary.mjs` — never a gate, never something that fails a CI check. A
named benchmark with no budget entry (`standalone-vs-combined`, `documentation-payload`,
`scoped-include`, `edge-cases`) is reported but never flagged; these are one-shot comparisons or
fixed-input sanity checks, not tiered regression targets.

## Benchmark interpretation rules

Stated up front so a future contributor doesn't have to re-derive them from a raw results diff:

- `cold-start` should scale approximately linearly with variable count once the constant
  process-boot floor is accounted for.
- `artifacts` should scale approximately linearly with total source bytes (discovery+parsing) and
  total output bytes (rendering).
- `standalone-vs-combined`'s standalone sum should meaningfully exceed `artifacts` at the same
  tier — if that gap shrinks toward zero, ADR 0011's shared-pass optimization has likely regressed
  or been bypassed.
- `documentation-payload`'s heavy-docs variant should increase roughly in proportion to output
  bytes at constant variable count — if it doesn't move at all, the payload isn't reaching the
  renderer the way the fixture intends.
- `scoped-include`'s discovery-walk component should track `artifacts`'s own discovery component
  at the same tier (both walk the same tree) — only the parse/render component should shrink.
  **Never read `scoped-include`'s headline number without this split**: `include` filters after
  discovery completes, not during it, so a blended "scoped is fast" number overstates what scoping
  actually saves.
- Runtime property access (first or repeated) is expected to remain constant-time; env-cap's
  `cache.ts` has no code path where it should vary. There is deliberately no benchmark for this —
  see "What's not benchmarked" below.
- Warm repeated `validateEnv()` calls are expected to remain constant-time regardless of tier, per
  its memoization guard — enforced by a unit assertion elsewhere in the test suite, not a
  maintained benchmark here.
- `artifacts`' `discoveryMs` field is measured via an _independent_ `discoverSchemaFiles()` call
  against the same fixtures, not extracted from `generateEnvArtifacts()`'s own internal pass
  (intentionally not public API) — close to, but not exactly, an internal phase split of the same
  run.

## Never compare

- Runtime numbers against build-time numbers — different processes, different fixtures, different
  cost drivers entirely.
- `enterprise` against the `baseline`/`stress`/`extreme` tiers — different shape, not just
  different size.
- Numbers produced under different `benchmarkSuiteVersion`s — even when they look close.
  `render-benchmark-summary.mjs` warns on a mismatch rather than silently diffing across one.
- `documentation-payload`'s minimal/heavy variants against the size-scaling tiers — it isolates
  payload size deliberately at a fixed variable count; it answers a different question than "does
  this scale with more variables."

## Non-goals

Filesystem cache effects, SSD speed, CPU frequency scaling, turbo boost, thermal throttling, NUMA
effects, parallel/worker-thread discovery (no such code path exists today), and cross-machine
comparisons (every result records its own `metadata.environment` precisely because hardware
varies — comparing two runs from different machines is not meaningful).

## What's not benchmarked, and why

Considered and deliberately cut, rather than merely never proposed — a fuller record than fits in
either directory's own README:

- **First-access vs. cached-access property reads** — no corresponding code path.
  `src/runtime/cache.ts`'s getter does the identical `Map.get`-based lookup on every call; nothing
  branches on whether this is the first time a key has been read. Benchmarking this would time two
  identical operations and call the noise a result.
- **Warm repeated `validateEnv()` calls** (`startup-validation`) — `validateEnv()` returns a
  cached result once `state.status` is `"ready"`/`"failed"`, without re-running the validation
  loop. A warm repeated call does a constant amount of work (one status check) regardless of tier
  size; measuring it across tiers doesn't add information beyond confirming it stays constant.
- **`active`/inactive contracts as a runtime axis** — `documentEnv()`'s `active` option is read in
  exactly one place in the whole codebase (`generate-manifest.ts`'s build-time filter).
  `createEnv()`/`validateEnv()` never read it, so a runtime benchmark contrasting active vs.
  inactive contracts wouldn't measure what it claims to.
- **`validation-failures`** — `runValidation()` loops over every variable in every contract
  regardless of outcome; a successful run and a run with many failures walk the same O(variables)
  full scan. Its cost shape is indistinguishable from `cold-start`'s own validate-phase.
- **AST parsing in isolation** — `parseSchemaFile()` is internal, not public API. A dedicated
  microbenchmark would track an implementation detail no user calls directly and would need
  updating on internal refactors unrelated to user-facing performance. Its cost is already
  exercised inside `artifacts`/`discovery`'s gap.
- **`manifest`/`documentation`/`usage` as three full tiered benchmark families** — standalone,
  each mostly re-measures the same discovery+link cost; a full tier matrix for all three would
  triple-count nearly the same number. Represented instead by one fixed-tier comparison
  (`standalone-vs-combined`).
- **Memory as a fully tiered min/median/p95 benchmark family** — no unbounded structure exists in
  `cache.ts` (Maps sized to what's registered); memory is a monotonic, unsurprising O(variables)
  fact. `cold-start` records one before/after snapshot per tier as a free byproduct instead.
- **Parallel/worker-thread discovery** — no such code path exists in the repository today.
- **Deep directory nesting and malformed-schema handling as tiered ladders** — real, but narrow,
  questions (one extra `readdir` call per nesting level; bounded parse-warning behavior on bad
  input). Answered once by fixed fixtures inside `edge-cases`, not a scaling ladder.
- **Package/bundle size as a benchmark** — already a hard-gated budget (ADR 0008, enforced by
  `scripts/check-size.mjs` at `prepublishOnly`). Reusing that measurement here as `metadata.package`
  context would duplicate an existing gate at a _weaker_ guarantee level; the gate stays
  authoritative.

## Versioning

Five independent version numbers, each answering a different question:

- `benchmarkSchemaVersion` — did the per-run JSON shape change?
- `benchmarkSuiteVersion` — did the methodology (which benchmarks exist, what they measure)
  change? Embedded in every result `id` (`s<suiteVersion>`).
- `generatorVersion` — did fixture-generation semantics change? A `fixtureHash` change is always
  traceable to an explicit bump here.
- `benchmarkToolVersion` — did the benchmark harness code itself change, independent of
  `envCapVersion` (the thing being measured)?
- `historySchemaVersion` — did `docs/benchmark-history/*.json`'s own aggregate shape change?

## `docs/benchmark-history/`

`docs/benchmark-history/runtime.json` and `.../buildtime.json` are append-only arrays of compact
entries (`medianMs` + a derived throughput figure per completed named-benchmark×tier, plus
versions/commit/timestamp) — not the full per-run detail already in each commit's own
`results.json`. Written to exactly once per merged `main` push, by CI only (never by a local `npm
run benchmark`), in the same bot PR that refreshes `results.json`. This is a data layer for a
future dashboard — structured, accumulating history only, no chart UI built yet. Living under
`docs/` means it's already reachable as a stable URL once GitHub Pages deploys, ready for this
project's own future dashboard or any external tool to consume.

## Reproduction

```bash
npm install
npm run build
npm run benchmark
```

From the repo root, this drives both directories via `scripts/run-benchmarks.mjs`. Each one can
also be run independently — see its own README.
