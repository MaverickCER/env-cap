---
"@maverickcer/env-cap": minor
---

Migrates the benchmark pipeline onto internal-package-contract's shared
benchmark engine (PR #22): `scripts/append-benchmark-history.mjs` and
`scripts/render-benchmark-summary.mjs` are removed in favor of
internal-package-contract's own `append-history.mjs`/`render-summary.mjs`,
called from a new reusable `benchmark-pr` workflow
(`internal-package-contract/.github/workflows/benchmark-pr.yml`) that
replaces this repo's own inline job steps. Committed benchmark history moves
from `docs/benchmark-history/` to `benchmark/history/` (matching data-cap's
own convention) and gains a v2 schema that carries each tier's full `inputs`
alongside `medianMs`. The `deploy` job now also publishes a generated
`docs/benchmarks/index.html` history chart page, built fresh from
`render-page.mjs` on every deploy, never committed.

This is internal tooling only -- no change to any published runtime or
build-time API.
