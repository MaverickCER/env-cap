# Evidence Model projections example

`env-cap` doesn't decide what compliance means. It produces verifiable evidence from the
configuration architecture, and provides the machinery necessary to transform that evidence into
whatever downstream standard or policy a consumer requires. That machinery is
`defineEvidenceProjection()` (`env-cap/evidence`), a pure, isomorphic transform from
an immutable `EvidenceModel` snapshot (assembled at build time by `generateEvidenceModel()`,
`env-cap/build`) to any output shape a consumer needs.

This example ships env-cap's own first-party reference projections, built entirely through that
same public API — no privileged internal access, the exact same two entry points a real consumer
would import. It reuses [`examples/application`](../basic-node/)'s exact schema (`src/env.ts`) so
each projection's output can be verified against the existing, already-tested rendering path
(`generateEnvArtifacts()`) on the exact same input.

```
src/
  env.ts                          <- the same schema as examples/application/src/env.ts
  server.ts                        <- a minimal real consumer (not a runnable app -- see below)
  generated/
    env.manifest.ts                <- generated, do not edit
scripts/
  generate-manifest.mjs             <- the baseline: generateEnvArtifacts(), unchanged
  project-env-example.mjs           <- runs the .env.example projection
  project-config-reference.mjs      <- runs the Configuration Reference projection
  project-inventory.mjs             <- runs the Configuration Inventory projection
  project-ownership.mjs             <- runs the Configuration Ownership projection
  project-lifecycle.mjs             <- runs the Configuration Lifecycle projection
  project-dependency-graph.mjs      <- runs the Configuration Dependency projection
  project-findings.mjs              <- runs the unified filterable Finding list projection
  project-drift.mjs                 <- runs the Configuration Drift projection
  project-migration.mjs             <- runs the Configuration Migration projection
  project-change-impact-audit-trail.mjs <- runs the Change Impact A (audit trail) projection
  project-change-impact-blast-radius.mjs <- runs the Change Impact B (blast radius) projection
  project-joined-variables.mjs      <- runs the Joined Variable View projection
projections/
  lib/to-discovered-contracts.mjs   <- shared Contract Model + Lifecycle Model -> DiscoveredContract[] reshape
  env-example.mjs                   <- the ".env.example Artifact" reference projection
  config-reference.mjs              <- the "Environment Configuration Reference" reference projection
  inventory.mjs                     <- the "Configuration Inventory" reference projection
  ownership.mjs                     <- the "Configuration Ownership" reference projection
  lifecycle.mjs                     <- the "Configuration Lifecycle" reference projection
  dependency-graph.mjs              <- the "Configuration Dependency" reference projection
  findings.mjs                       <- the unified filterable Finding list reference projection
  drift.mjs                          <- the "Configuration Drift" reference projection
  migration.mjs                      <- the "Configuration Migration" reference projection
  change-impact-audit-trail.mjs      <- the Change Impact A (audit trail) reference projection
  change-impact-blast-radius.mjs     <- the Change Impact B (blast radius) reference projection
  joined-variables.mjs               <- the Joined Variable View reference projection (added after the original ten)
docs/
  ENVIRONMENT.md                     <- generated (by the baseline path)
.env.example                         <- generated (by the baseline path)
projected-env-example.txt            <- generated (by the env-example projection)
projected-config-reference.md        <- generated (by the config-reference projection)
projected-inventory.json             <- generated (by the inventory projection)
projected-ownership.json             <- generated (by the ownership projection)
projected-lifecycle.json             <- generated (by the lifecycle projection)
projected-dependency-graph.{dot,mmd,json} <- generated (by the dependency-graph projection)
projected-joined-variables.json      <- generated (by the joined-variables projection)
expected/                            <- golden regression fixtures, see examples/README.md
```

`src/server.ts` is a minimal, real consumer of `env` (imports it, reads two of its five
variables) -- not a runnable app (this example has no `start` script; other examples like
`basic-node` already cover the runtime-validation story). It exists so the projections that
depend on real usage data (Configuration Ownership, Configuration Dependency) have something
more interesting to show than "never consumed anywhere."

## Running it

```bash
npm install
npm run generate:env               # the baseline path: generateEnvArtifacts()
npm run project:env-example        # generateEvidenceModel() + the .env.example projection
npm run project:config-reference   # generateEvidenceModel() + the Configuration Reference projection
npm run project:inventory          # generateEvidenceModel() + the Configuration Inventory projection
npm run project:ownership          # generateEvidenceModel() + the Configuration Ownership projection
npm run project:lifecycle          # generateEvidenceModel() + the Configuration Lifecycle projection
npm run project:dependency-graph   # generateEvidenceModel() + the Configuration Dependency projection
npm run project:findings           # generateEvidenceModel() + the unified filterable Finding list projection
npm run project:drift              # generateEvidenceModel() + checkEnvArtifacts() + the Configuration Drift projection
npm run project:migration          # generateEvidenceModel() + the Configuration Migration projection
npm run project:change-impact-audit-trail  # generateEvidenceModel() + the Change Impact A projection
npm run project:change-impact-blast-radius # generateEvidenceModel() + the Change Impact B projection
npm run project:joined-variables   # generateEvidenceModel() + the Joined Variable View projection
```

## The projections landed so far

**`.env.example` Artifact** (`projections/env-example.mjs`) — `project:env-example` prints
whether the projection's output is byte-identical to the baseline's `.env.example`. It is, by
construction: a thin reshape into `renderEnvExample()`'s existing, unchanged input shape, not a
reimplementation of `.env.example` rendering.

**Environment Configuration Reference** (`projections/config-reference.mjs`) — a thin reshape
into `renderDocs()`'s existing, unchanged input shape. Verified against a dedicated `expected/`
golden fixture rather than byte-identity with the baseline (see "Known divergences" below).

**Configuration Inventory** (`projections/inventory.mjs`) — the JSON-consumer-facing sibling of
Configuration Reference's "## Catalog" section (`docs.ts`'s `buildCatalog()`/`CatalogContract`
are documented as "Same data `renderCatalog()` renders to Markdown, reshaped for JSON/
programmatic consumers instead of prose" — but neither is exported publicly, so this projection
reproduces that reshape using only the public `effectiveOwner()`). Also verified against a
dedicated `expected/` golden fixture, for the same reasons as Configuration Reference.

**Configuration Ownership** (`projections/ownership.mjs`) — like Inventory, a *data* projection:
`usage-report.ts`'s `renderUsageReport()` is a private implementation detail of
`generateUsageReport()`'s orchestration (never re-exported), so this projection's output is the
same shape its (also private) `RenderUsageReportOptions` describes — `dependencyOwnership` plus
the four ownership-family finding arrays plus `parseWarnings` — for a consumer's own renderer to
use, built from Contract Model, Dependency Model, and Finding Model together. Confirmed
identical to `generateEnvArtifacts()`'s own `result.usage` for this example's single-contract
schema; verified against a dedicated `expected/` golden fixture in general, since multi-contract
schemas hit the same canonical-vs-discovery ordering divergence documented above.

**Configuration Lifecycle** (`projections/lifecycle.mjs`) — absorbs the audit's separate
"Expiration" and "Deprecation" report types into one projection: `expiring` (Lifecycle Model's
own pre-computed list, passed through) alongside `deprecatedContracts`/`deprecatedVariables`
(filtered here, since Lifecycle Model doesn't pre-compute a flat deprecated list the way it does
for expiring entries). Also fixed a real bug found while building this: `LifecycleModel.expiring[].file`
was leaking an absolute, machine-specific filesystem path, inconsistent with
`LifecycleModelContract.file`'s own root-relative convention on the very same model — fixed at
the source (`src/build/lifecycle-model.ts`), not worked around here.

**Configuration Dependency** (`projections/dependency-graph.mjs`) — DOT, Mermaid, and plain JSON
graph export over Dependency Model. Unlike every projection before it, there's no existing
`env-cap/build` renderer to reshape into at all: `dependency-model.ts`'s own module
doc comment says graph-format rendering is "deliberately not here -- that's presentation over
this model's data, not the model itself" (ADR 0027). This is genuinely new rendering logic, built
from `DependencyModel.consumers` (ADR 0027's inverse file→contracts index) -- one node per
contract, one node per consuming file, one directed edge per real "this file consumes this
contract" relationship.

**Unified filterable Finding list** (`projections/findings.mjs`) — indexes Finding Model's flat
`Finding[]` (ADR 0026) by severity, family, code, and contract, so a consumer can look a bucket
up directly instead of filtering the whole array on every query. Also normalizes a real
portability hazard: `ContractEvidenceReference.file` is documented as an absolute path (an
intentional convention, matching what `CompatibilityIssue`/`DocumentationFindings` -- the sources
`buildFindingModel()` adapts -- need for their own direct consumers), which would otherwise put a
machine-specific filesystem path straight into this projection's JSON output. This projection
normalizes it to Contract Model's portable, root-relative convention instead, the same choice
`lifecycle.mjs` makes for `LifecycleModel.expiring[].file` -- except here it's Finding Model
behaving exactly as documented, not a bug, so the fix belongs in the projection, not the source.

**Configuration Drift** (`projections/drift.mjs`) -- the first projection whose data genuinely
can't come from `EvidenceModel` alone: drift is "does the committed file on disk match what a
real run would generate right now," and `EvidenceModel` is a snapshot of *discovered* reality,
never a comparison against previously-written output. `artifactCheckFindings` is a factory
parameter -- the same pattern `config-reference.mjs`'s `expiringWithinDays` establishes -- for
context `defineEvidenceProjection()`'s `(evidence) => T` signature has no room for; a real caller
runs `checkEnvArtifacts()` itself and passes the result in. Also relativizes
`ArtifactCheckFinding.path` (documented as absolute) at the script level, where `root` is
actually available, before the projection ever sees it.

**Configuration Migration** (`projections/migration.mjs`) -- **scope note**: no existing report
type or renderer anchors this one; the plan flagged it as needing a judgment call rather than
blocking on it. Implements the rename-correlation-checklist interpretation: a concrete,
actionable instruction per variable rename Change Model correlated from an authored
`renamedFrom` (ADR 0029/0030 -- never guessed from name similarity), plus variables removed
*without* a matching rename (a real migration signal, distinct from a rename: something to stop
referencing entirely, not update to a new name). Empty for this example on purpose: `src/env.ts`
hasn't changed since the committed manifest snapshot, so there's nothing to migrate -- the
correlation logic itself is already covered by `test/build/change-model.test.ts`; this
projection only reshapes already-tested data.

**Change Impact A (audit trail)** (`projections/change-impact-audit-trail.mjs`) -- absorbs the
audit's "Audit Trail" report type, scoped to "since the one committed manifest snapshot" (already
supported by Change Model) rather than true N-run history, which would be new scope beyond ADR
0021's single-snapshot design -- the plan's own guidance for this phase. A thin reshape of
`evidence.change` plus one human-readable summary line; empty for this example's fixture for the
same reason Configuration Migration's is.

**Change Impact B (blast radius)** (`projections/change-impact-blast-radius.mjs`) -- "the
actual Change x Dependency join `computeArtifacts()` never does today," and the plan's own
estimate for the most complex of the ten. Joins every changed contract/variable (Change Model)
against its current real consumers (Dependency Model), by `file`+`exportName` identity, to answer
"if this change ships, which files does it actually affect." A **removed** contract/variable's
blast radius always reports `0` by construction -- Dependency Model reflects *current* reality,
and a removed contract no longer exists in it to have consumers -- meaningful for **added** and
**updated** changes, where the current consumer set is exactly the set actually affected. Empty
for this example's fixture for the same reason as the other change-based projections; the join
logic itself was verified manually during development against a fresh (no-snapshot) run, where
every one of the schema's 5 variables and its 1 contract correctly correlated to `src/server.ts`
as their real consumer.

This was the tenth and last of the ten first-party reference projections the original plan (ADR
0024) called for.

**Joined Variable View** (`projections/joined-variables.mjs`) -- an eleventh projection, added
afterward, not part of ADR 0024's original ten. Every projection above performs its own version
of joining Contract Model against one or more of Dependency/Ownership/Lifecycle Model by
`${file}#${exportName}` (or `#${key}`) identity; this one exists purely to give a
`defineEvidenceProjection()` author a working, copyable example of that join -- one row per
declared variable, merging Contract Model, Dependency Model, and Lifecycle Model fields, with a
fixed and documented field list (see the projection's own doc comment). Deliberately shipped here,
as an example, rather than as a package export -- see ADR 0033's "Alternatives considered" on why
a 6th public entry point exporting ready-made projections was rejected.

## Known divergences from the direct-call baseline

Two of `ContractModel`'s own properties (ADR 0025) mean a projection built from it isn't always
byte-identical to what the equivalent direct `generateEnvArtifacts()` call produces on the exact
same input — both are intentional properties of the model, not bugs, documented in each
affected projection's own doc comment:

- **Variable ordering.** `ContractModel` stores variables in canonical alphabetical order
  (`buildContractModel()` — needed for deterministic JSON); `DiscoveredContract` preserves the
  schema's original declaration order. Any renderer that displays variables in whatever order
  it's handed (`renderDocs()`, `buildCatalog()`) therefore shows alphabetical order here,
  whenever that differs from declaration order (as it does for this example's schema).
- **File paths.** `ContractModel.file` is root-relative and POSIX-separated — portable and
  JSON-serializable by design, since an `EvidenceModel` may be read on a different machine than
  the one that generated it. `DiscoveredContract.file` is an absolute filesystem path. A
  Markdown renderer that only ever displays a *relative* path (`renderDocs()`, via
  `relativeTo()`'s pure string-prefix-strip) is unaffected; a JSON projection that surfaces
  `.file` directly (`inventory.mjs`) shows the relative form.

Additionally, `config-reference.mjs`'s "Changes since last report" section always reads as a
first-time render ("No changes.") — a pure projection has no access to a previously-rendered
docs file to diff against.

## Why "thin reshape, not reimplementation" is the point

Each reference projection here is deliberately *not* new rendering logic. It's a reshape of one
or more of the seven canonical fact models (`ContractModel`, `DependencyModel`, `OwnershipModel`,
`LifecycleModel`, `FindingModel`, `ChangeModel`, and their `EvidenceModel` union) into whatever
shape an existing, already-tested `env-cap/build` renderer/builder already expects,
then a direct call into it. That's the whole design: the seven fact models are the real API
surface; a projection is a *view* over them, not a second, independently-drifting source of truth.
