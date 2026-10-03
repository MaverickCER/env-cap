# 0031: A 5th public entry point (`./evidence`) for Evidence Model projections

## Status

Accepted. Implemented in `src/evidence/`, exported as
`@maverickcer/env-cap/evidence`.

## Context

ADR 0024 established seven canonical fact models, the last of which --
Evidence -- assembles the other six into one immutable snapshot and exists
specifically to be projected into whatever shape a downstream consumer
needs (a Markdown report, a compliance export, a dashboard's JSON feed),
rather than env-cap hand-rolling each of those shapes itself. That
projection mechanism, `defineEvidenceProjection()`, has a different runtime
profile than everything `@maverickcer/env-cap/build` exports: assembling an
`EvidenceModel` requires `node:fs` and the TypeScript compiler API (Node-only,
dev/CI tooling, per ADR 0002 and `specs/architecture.md`), but _running a
projection over an already-assembled model_ does not -- a projection is a
pure function of a plain, JSON-serializable object, no different in kind
from `createEnv()`/`validateEnv()`'s own isomorphic contract. A dashboard
backend, an edge function, or a CI step that only has a previously-generated
`EvidenceModel` JSON file on disk (or over the wire) should be able to run a
projection against it without pulling in `typescript` or `node:fs` at all.

## Decision

- **A 5th entry point, not a `./build` export.** `defineEvidenceProjection()`
  ships as `@maverickcer/env-cap/evidence`, isomorphic like `runtime` and
  `helpers` (`platform: "neutral"`, `target: "es2020"` in `tsup.config.ts`),
  rather than living inside `@maverickcer/env-cap/build` alongside the
  Node-only model builders. Bundling it with `build` would mean any consumer
  running a projection in a browser or edge function pulls in the TypeScript
  compiler API transitively, defeating the isomorphism this module exists to
  provide.
- **`EvidenceModel` is imported as a type only.** `src/evidence/` needs to
  name the shape it projects over, but never constructs one -- that's
  `generateEvidenceModel()`'s job (`@maverickcer/env-cap/build`, a later
  phase). `src/evidence/define-projection.ts` imports `EvidenceModel` from
  `src/build/evidence-model.ts` with `import type` only, erased entirely at
  compile time under `verbatimModuleSyntax` -- a second, deliberate instance
  of the one cross-folder pattern `helpers`→`runtime` already established
  (see `specs/architecture.md`), not an exception carved out for this
  feature alone.
- **No default export.** Unlike the eslint-plugin entry point (ADR 0017),
  `src/evidence/index.ts` has only named exports, so it needs none of the
  CJS-interop postprocessing `scripts/fix-eslint-plugin-cjs-interop.mjs`
  exists for -- esbuild's ordinary CJS output already resolves
  `require("@maverickcer/env-cap/evidence").defineEvidenceProjection`
  correctly.
- **Experimental tier.** Like `packages` (ADR 0014) and `./build`'s
  lower-level primitives, `./evidence` ships Experimental rather than
  Stable -- see `VERSIONING.md`. The provenance mechanism (ADR 0032) is new
  enough that real projection authorship is likely to reveal a better shape
  before it's ready to commit to for good.

## Consequences

- `tsup.config.ts`, `scripts/emit-dts-shims.mjs`, `scripts/check-size.mjs`
  (a 3KB gzip budget, matching `runtime`/`helpers`), `typedoc.json`,
  `package.json#exports`, `AGENTS.md`, and `VERSIONING.md` each gained an
  `evidence` entry, mirroring every other place ADR 0017 already touched for
  `eslint-plugin`.
- `specs/architecture.md`'s "entry points" section and diagram describe five
  directories instead of four, with a second type-only cross-folder edge
  (`evidence` → `build`) alongside `helpers` → `runtime`.
- A consumer who only ever calls env-cap's build-time generators never pays
  for `./evidence`'s existence -- it's a separate bundle, untouched unless
  imported.

## Alternatives considered

- **Export `defineEvidenceProjection()` from `@maverickcer/env-cap/build`
  alongside the six model builders.** Rejected -- would make every consumer
  of a projection also a transitive consumer of the TypeScript compiler API
  and `node:fs`, breaking the "run anywhere a persisted snapshot travels"
  goal this mechanism exists to serve, and would put `./build`'s tight
  `999KB` (effectively unbudgeted, dev/CI-only) size profile in tension with
  `./evidence`'s deliberately tiny one.
- **Export it from the package root (`.`, alongside `createEnv`/
  `validateEnv`).** Rejected -- the root entry point's whole identity is a
  fixed, tiny (3KB gzip) runtime surface (ADR 0008); adding a second,
  independently-growing feature there risks that budget for a capability
  most runtime consumers never use, the same reasoning that kept `helpers`
  and `eslint-plugin` as their own entry points rather than root additions.
