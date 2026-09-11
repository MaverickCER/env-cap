# 0034: `examples/` restructured into three audience-shaped flagships; every other scenario moves to `test/integration/`

## Status

Accepted. Implemented.

## Context

`examples/` grew to fourteen flat, feature-demo directories, each proving one distinct
capability (the packaged CLI binary, cross-package discovery, tsconfig path-alias resolution, the
`liveExpirationDates` callback, per-variable validation contexts, deliberately-broken negative
cases, and more). Useful as regression coverage, but as a _reading list_ for someone new to
`env-cap`, fourteen peer directories with no ordering signal beyond a numbered list asked a reader
to sift through all of them to find the one shape that matched their own situation.

Examples are for humans exploring a library for the first time. Integration fixtures are for
correctness — a scenario worth regression-testing is not automatically a scenario worth reading
through as an adoption sample. Those had been conflated into one directory.

## Decision

- **`examples/` holds exactly three flagships**, each answering a different question, in reading
  order: [`application/`](../../examples/application/) ("how does this make my code better?",
  evolved in place from the old `basic-node/`), [`team-service/`](../../examples/team-service/)
  ("how does this help my team?", evolved from `composable-boilerplates/` with real
  multi-team ownership and a `classification`-tagged secret added, not a plain rename — see
  below), and `enterprise-platform/` ("how does this help my organization?", a new build).
- **`team-service` is not a rename.** `composable-boilerplates`' actual content —
  `exclusiveGroup`/`active: false` schema-composition mechanics — never centered on ownership,
  classification, or a `--check` CI gate, which is what the "engineering team" tier needs to
  demonstrate. A fourth capability (`auth`, owned by `security-team` rather than the database/orm
  capabilities' `data-platform-team`, carrying a `classification: "secret"` variable) and a
  `verify:env` script using `--check` (ADR 0016) were added so the generated ownership matrix and
  security review have genuine, multi-team content, and the CI-gate pattern is actually
  demonstrated, not just described.
- **The other twelve scenarios physically relocate to `test/integration/`**, not just get
  re-narrated in documentation — `positive/{basic,team,enterprise}/` and
  `negative/{invalid-config,exclusive-violation}/`, matching whether each proves a working path or
  a deliberately broken one. Each fixture keeps its exact internal shape (own `package.json`, own
  `generate:env`/`typecheck` scripts, own `expected/` golden fixtures) — only its directory, the
  resulting `file:` dependency depth (`file:../..` at two directories deep becomes
  `file:../../../../..` at five), and human-facing narrative (no top-level README, no listing in
  `examples/README.md`) change. **Zero coverage loss** — every scenario the fourteen originally
  proved is still exercised in CI exactly as before.
- **Test infrastructure is shared, not forked.** `test/examples/support.ts` (the shared
  `isInstalled`/`runScript`/`runStart`/`compareGoldenArtifacts` helpers) moves to
  `test/support/example-runner.ts`, with every helper's implicit `examplesRoot` replaced by an
  explicit directory argument each caller resolves itself — `test/integration/flagships/` and
  `test/integration/{positive,negative}/` both consume the one module. `test/examples/` no longer
  exists.
- **`.github/workflows/ci.yml`'s single `examples` job splits into two**: `examples` (the three
  flagships) and `integration-fixtures` (the twelve relocated fixtures), each installing and
  typechecking only what it's responsible for, each running its own `vitest run` scope
  (`test/integration/flagships/` vs. `test/integration/positive/ test/integration/negative/`).

## Consequences

- A reader following `examples/README.md` sees three directories with a clear "read in this
  order" signal, not fourteen with none.
- A behavior-specific regression (e.g. "does `--tsconfig` resolution still work") is found under
  `test/integration/positive/enterprise/tsconfig-aliases/`, not by guessing which of fourteen
  example READMEs happens to mention it.
- `scripts/update-example-goldens.mjs`'s single `EXAMPLES` map splits into a `FLAGSHIPS` map
  (rooted at `examples/<name>`) and a `FIXTURES` map (rooted at each fixture's own
  `test/integration/...` path) — the update mechanism itself (regenerate, copy into `expected/`)
  is unchanged.
- A packed-tarball producer/consumer pair (`paypal-addon`/`paypal-consumer`,
  `tsconfig-aliases`/`tsconfig-aliases-consumer`) still resolves correctly after relocation only
  once each side's `node_modules` is freshly installed — a stale `node_modules` carried over from
  before a directory move retains a symlink pointing at the old, now-wrong relative depth. This is
  expected (any fresh CI checkout always installs clean) and was verified by hand during this
  migration, not assumed from the path arithmetic alone.

## Alternatives considered

- **Leave all fourteen in `examples/`, just reorder/re-tier the README's list.** Rejected — the
  actual complaint was volume and undifferentiated presentation, not ordering; a reader still has
  to open and discard eleven directories that aren't relevant to their situation.
- **Drop the twelve relocated scenarios' coverage entirely**, keeping only the three flagships'
  own tests. Rejected outright — each of the twelve proves something a flagship's own content
  doesn't (the packaged CLI binary, cross-package discovery, tsconfig aliases, live external
  metadata, validation contexts, both negative cases), and dropping any of them is a real
  regression-coverage loss, not a documentation simplification.
