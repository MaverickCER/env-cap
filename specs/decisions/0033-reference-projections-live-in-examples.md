# 0033: The ten first-party reference projections live in `examples/`, not `src/`

## Status

Accepted. Implemented starting with `examples/evidence-projections/`. **Superseded in part by
ADR 0034**: the three-tier `examples/` restructuring relocated this package to
`test/integration/positive/enterprise/evidence-projections/` as a behavioral fixture rather than a
human-facing example — the reasoning below (no privileged internal path, reuses the flagship
schema, golden-fixture regression protection) is unchanged and still governs it; only its
directory and presentation to readers changed.

## Context

ADR 0024's plan calls for ten first-party reference projections (`.env.example`, Environment
Configuration Reference, Configuration Inventory, and so on) built through
`defineEvidenceProjection()` (`env-cap/evidence`, ADR 0031) with "no privileged
internal path" — the same public API a real consumer would use. Each one, in practice, needs
both halves of that API: `generateEvidenceModel()` (Node-only, `env-cap/build`) to
assemble an `EvidenceModel`, and `defineEvidenceProjection()` (isomorphic,
`env-cap/evidence`) to project it. `src/evidence/` currently has exactly one
sanctioned cross-folder edge — a type-only import of `EvidenceModel` from `src/build/`, erased at
compile time (ADR 0031) — and no edge at all onto any of `src/build/`'s actual renderer
_functions_ (`renderEnvExample`, `renderDocs`, etc.), which several of these projections need to
call directly to stay "thin wrappers" rather than reimplemented rendering logic.

## Decision

- **The reference projections live in `examples/evidence-projections/`, a new example package
  structured like every other directory in `examples/`** — its own `package.json` depending on
  `env-cap` via `file:../..`, importing `env-cap/build` and
  `env-cap/evidence` exactly as an external consumer's own project would. Nothing
  inside it reaches into `src/**/*.ts` or an unexported build internal.
- **This is the literal, strongest form of "no privileged internal path."** A file living inside
  `src/build/` importing from `src/evidence/` (or vice versa) would still be _inside the
  package_, with the option of reaching past the public surface even if it chose not to.
  A file in `examples/evidence-projections/`, installing the package the same way a real
  consumer does, structurally cannot.
- **`src/`'s five-folder, zero-(or type-only-)cross-dependency invariant is left completely
  untouched.** No new ADR-sanctioned edge was needed on either `src/build/` or `src/evidence/` —
  the tension that raised this question in the first place (a projection needing both a
  Node-only renderer and the isomorphic projection mechanism) is resolved by placing the
  _consumer_ of both outside `src/` entirely, not by adding a new edge between them.
  `src/evidence/`'s one type-only edge onto `src/build/evidence-model.ts` is unaffected.
- **Reuses `examples/basic-node`'s exact schema.** Each projection's output can be verified
  byte-identical to what the existing, already-tested `generateEnvArtifacts()` path produces on
  the exact same input — the strongest form of regression protection available, and proof that a
  projection is a _reshape_, not a second, independently-drifting rendering implementation.
- **Wired into the same infrastructure every other example uses**: `.github/workflows/ci.yml`'s
  `examples` job, `test/examples/evidence-projections.test.ts`, `examples/README.md`'s ordered
  list, and `scripts/update-example-goldens.mjs`'s `EXAMPLES` map — no special-cased tooling.

## Consequences

- A consumer cannot `import` env-cap's reference projections as ready-made functions from the
  published package — only copy the pattern, the same way every other `examples/` directory is
  a pattern to copy, not an importable module. This was an explicit, accepted tradeoff (see
  Alternatives below), not an oversight.
- Each reference projection needs its own small reshape from a canonical fact model's shape
  (e.g. `ContractModelContract`) into whatever shape the renderer it wraps already expects (e.g.
  `DiscoveredContract`) — genuine, if mechanical, adapter code, not a zero-cost pass-through.
  Fields the target renderer doesn't use (e.g. `renderEnvExample()` never reads
  `deprecated`/`deprecatedReason`) are stubbed `undefined` rather than sourced from a
  cross-referenced model, to keep each projection's own scope narrow.
- `examples/evidence-projections/`'s own `expected/` golden fixtures follow the exact same
  regression-fixture convention documented in `examples/README.md` — regenerated only via
  `npm run examples:update-golden`, never silently.

## Alternatives considered

- **Inside `src/build/`, importing `defineEvidenceProjection` from `src/evidence/`.** Rejected —
  would require a new ADR sanctioning a second, _value-level_ cross-folder edge (unlike the
  existing type-only ones), and would mean `src/build/` could no longer move to its own
  repository without `src/evidence/` coming along, a real cost for a set of files whose whole
  point is demonstrating the _public_, cross-package-boundary API, not needing privileged access.
- **A 6th public entry point exporting the ten projections as ready-made functions** (e.g.
  `env-cap/projections`). Rejected for this round — would commit env-cap to
  versioning and supporting ten specific output shapes as Stable-track API surface before any
  real external usage has validated they're the right shapes (the same reasoning `VERSIONING.md`
  already applies to `packages` and `./evidence` itself). Revisiting this once real projection
  authorship (env-cap's own and consumers') has had a feedback cycle is explicitly left open,
  not foreclosed.
