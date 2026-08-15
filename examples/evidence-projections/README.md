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
each projection's output can be verified byte-identical to the existing, already-tested rendering
path (`generateEnvArtifacts()`) on the exact same input.

```
src/
  env.ts                          <- the same schema as examples/basic-node/src/env.ts
  generated/
    env.manifest.ts                <- generated, do not edit
scripts/
  generate-manifest.mjs            <- the baseline: generateEnvArtifacts(), unchanged
  project-env-example.mjs          <- runs the .env.example projection, compares it
projections/
  env-example.mjs                  <- the ".env.example Artifact" reference projection
docs/
  ENVIRONMENT.md                    <- generated (by the baseline path)
.env.example                        <- generated (by the baseline path)
.env.example.via-projection         <- generated (by the projection)
```

## Running it

```bash
npm install
npm run generate:env          # the baseline path: generateEnvArtifacts()
npm run project:env-example   # the projection path: generateEvidenceModel() + defineEvidenceProjection()
```

`project:env-example` prints whether the projection's output is byte-identical to the baseline's
`.env.example` — it is, by construction (see `projections/env-example.mjs`'s own doc comment for
why: it's a thin reshape of Contract Model into `renderEnvExample()`'s existing, unchanged
input shape, not a reimplementation of `.env.example` rendering).

## Why byte-identical is the point

Each reference projection here is deliberately *not* new rendering logic. It's a reshape of one
or more of the seven canonical fact models (`ContractModel`, `DependencyModel`, `OwnershipModel`,
`LifecycleModel`, `FindingModel`, `ChangeModel`, and their `EvidenceModel` union) into whatever
shape an existing, already-tested `@maverickcer/env-cap/build` renderer expects, then a direct
call into that renderer. That's the whole design: the seven fact models are the real API surface;
a projection is a *view* over them, not a second, independently-drifting source of truth.
