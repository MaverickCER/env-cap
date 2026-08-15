# Evidence Model projections example

`env-cap` doesn't decide what compliance means. It produces verifiable evidence from the
configuration architecture, and provides the machinery necessary to transform that evidence into
whatever downstream standard or policy a consumer requires. That machinery is
`defineEvidenceProjection()` (`@maverickcer/env-cap/evidence`), a pure, isomorphic transform from
an immutable `EvidenceModel` snapshot (assembled at build time by `generateEvidenceModel()`,
`@maverickcer/env-cap/build`) to any output shape a consumer needs.

This example ships env-cap's own first-party reference projections, built entirely through that
same public API — no privileged internal access, the exact same two entry points a real consumer
would import. It reuses [`examples/basic-node`](../basic-node/)'s exact schema (`src/env.ts`) so
each projection's output can be verified against the existing, already-tested rendering path
(`generateEnvArtifacts()`) on the exact same input.

```
src/
  env.ts                          <- the same schema as examples/basic-node/src/env.ts
  generated/
    env.manifest.ts                <- generated, do not edit
scripts/
  generate-manifest.mjs            <- the baseline: generateEnvArtifacts(), unchanged
  project-env-example.mjs          <- runs the .env.example projection, compares it
  project-config-reference.mjs     <- runs the Configuration Reference projection
projections/
  env-example.mjs                  <- the ".env.example Artifact" reference projection
  config-reference.mjs             <- the "Environment Configuration Reference" reference projection
docs/
  ENVIRONMENT.md                    <- generated (by the baseline path)
.env.example                        <- generated (by the baseline path)
projected-env-example.txt           <- generated (by the env-example projection)
projected-config-reference.md       <- generated (by the config-reference projection)
expected/                           <- golden regression fixtures, see examples/README.md
```

## Running it

```bash
npm install
npm run generate:env               # the baseline path: generateEnvArtifacts()
npm run project:env-example        # generateEvidenceModel() + the .env.example projection
npm run project:config-reference   # generateEvidenceModel() + the Configuration Reference projection
```

## The two projections landed so far

**`.env.example` Artifact** (`projections/env-example.mjs`) — `project:env-example` prints
whether the projection's output is byte-identical to the baseline's `.env.example`. It is, by
construction: a thin reshape of Contract Model into `renderEnvExample()`'s existing, unchanged
input shape, not a reimplementation of `.env.example` rendering.

**Environment Configuration Reference** (`projections/config-reference.mjs`) — a thin reshape of
Contract Model *and* Lifecycle Model (joined by `file`+`exportName` identity) into
`renderDocs()`'s existing, unchanged input shape. Verified against a dedicated `expected/`
golden fixture rather than byte-identity with the baseline, because of two documented,
non-bugs (see the projection's own doc comment):

- **Variable ordering.** `ContractModel` stores variables in canonical alphabetical order
  (`buildContractModel()`, ADR 0025 — needed for deterministic JSON); `DiscoveredContract`
  preserves the schema's original declaration order. `renderDocs()` displays variables in
  whatever order it's handed, so this projection's tables are alphabetical, not
  declaration-order, whenever the two differ (as they do for this example's schema).
- **"Changes since last report."** A pure projection has no access to a previously-rendered
  docs file, so this section always reads as a first-time render ("No changes.").

## Why "thin reshape, not reimplementation" is the point

Each reference projection here is deliberately *not* new rendering logic. It's a reshape of one
or more of the seven canonical fact models (`ContractModel`, `DependencyModel`, `OwnershipModel`,
`LifecycleModel`, `FindingModel`, `ChangeModel`, and their `EvidenceModel` union) into whatever
shape an existing, already-tested `@maverickcer/env-cap/build` renderer expects, then a direct
call into that renderer. That's the whole design: the seven fact models are the real API surface;
a projection is a *view* over them, not a second, independently-drifting source of truth.
