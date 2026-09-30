# Runtime performance benchmark

Measures `createEnv()`/`validateEnv()`'s own cost as contract/variable count scales, plus
`env-cap/helpers`' shipped processor/validator throughput. See
[`../README.md`](../README.md) for full methodology, tier definitions, and the
"never compare" rules. This README covers only what's specific to this example.

## Run it

```bash
npm install
npm run benchmark
```

Writes `results.json` (immutable measurement record) and `RESULTS.md` (its human-readable
rendering). Both are committed -- CI refreshes them on `main` via a bot PR, never by pushing
directly. `fixtures/` is generated on demand and gitignored.

## What's measured

One named benchmark, **`cold-start`**, across all four tiers (`baseline`/`stress`/`extreme`/
`enterprise`): a fresh child process imports a tier's generated contracts (triggering
`createEnv()` for each, as a side effect of module evaluation -- see
[`../basic-node/src/env.ts`](../basic-node/src/env.ts)) and then runs one `validateEnv()` call.
Each sample is a brand-new process (zero warmup by construction -- a cold process can't be
"warmed"). The parent measures total wall-clock time per spawn; the child self-reports how much
of that was its own `createEnv` phase vs. its own `validateEnv` phase, so a regression can be
attributed to the right phase instead of only showing up as "cold-start got slower."

**Fixtures here use identity processors and no validators**, deliberately different from
`../performance-buildtime`'s realistic ones -- see `../README.md`'s "Runtime fixture
design" section for why: processor/validator execution cost belongs to the application that
supplies them, not to env-cap's own architecture, and mixing it in would make a regression here
ambiguous between "env-cap got slower" and "the fixture's processor got slower."

Considered and cut from this example: `validation-failures`, `startup-validation` (warm
repeated `validateEnv()` calls), and first-access-vs-cached-access. Each is either redundant
with `cold-start` or doesn't correspond to a real code path -- see `../README.md`.

A second named benchmark, **`helpers`**, across the same four tiers: every processor/validator
`env-cap/helpers` ships, each called with a representative valid input, cycled
`tierTotalVariables(tier) * 100` times per tier (see `scripts/run-benchmark.mjs`'s own comment for
why the `×100` -- at a tier's raw variable count, a single sample is mostly measurement overhead,
not real signal, since each call costs well under a microsecond). `totalMs` is processors+validators
combined; `processorsMs`/`validatorsMs` report each half separately. Unlike `cold-start`, this runs
entirely in-process (no child-process spawn), so its numbers are naturally noisier at small scale --
see `../benchmark-fixtures/budgets.mjs`'s comment on why its regression budget is looser.
