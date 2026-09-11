# 0027: Dependency Model publishes a fact-shaped result, not the scanning engine

## Status

Accepted. Implemented in `src/build/dependency-model.ts`
(`buildDependencyModel()`, `DependencyModel`), exported from
`env-cap/build`. `src/build/dependency-graph.ts`'s
`buildDependencyGraph()`, `scan-dependencies.ts`'s
`scanFileForDependencies()`, and every other engine internal stay
unexported, unchanged from ADR 0010.

## Context

ADR 0010 drew a boundary around the dependency-ownership engine
(`scan-dependencies.ts`, `dependency-graph.ts`): its scanning/graph-building
internals are not exported from `env-cap/build`, only the ownership-framed
result `generateUsageReport()` maps them into. That ADR's stated reason was
that no real external use case had justified exporting the raw graph, and
that env-cap "answers ownership/visibility questions... it doesn't ship a
general-purpose static-analysis toolkit."

ADR 0024 names Dependency Model as one of the seven canonical facts models,
with two gaps the audit identified: no consumer-indexed view (file -> which
contracts it reads; only the inverse, contract -> consuming files, exists
today), and per-access-site line numbers that `scan-dependencies.ts`'s
`AccessSite.line` already computes but `dependency-graph.ts` discards before
even its own internal `VariableAccessInfo` type retains them.

## Decision

**Publish a new, fact-shaped `DependencyModel` built on top of the existing
engine, without exporting the engine itself.** `buildDependencyModel()`
takes the same inputs `buildDependencyGraph()` already does, calls it
internally, and projects the result into a versioned, JSON-serializable
shape:

- **This does not relax ADR 0010's boundary.** That ADR's actual constraint
  is on the _engine's implementation internals_ -- `scan-dependencies.ts`'s
  AST-walking vocabulary, `dependency-graph.ts`'s two-pass
  building/resolution logic -- staying unexported so nothing outside this
  package depends on their exact shape. A _derived fact_, computed by that
  engine and published in a stable, versioned form, is a different thing
  entirely -- the same relationship `ManifestChangeReport` already has to
  `manifest-snapshot.ts`'s internal diffing functions (ADR 0021), or
  `OwnershipDependencyEntry` has to this same engine, already exported
  today via `usage-report.ts`.
- **Line numbers are threaded through `VariableAccessInfo` first**, since
  that internal type is where `scan-dependencies.ts`'s `AccessSite.line`
  was being discarded (the two-pass resolution only ever recorded a boolean
  "was this member accessed," never where). Aggregated across every
  consuming file per variable, not attributed per-file -- a full per-file
  breakdown is real added scope this fact didn't need to unblock right now,
  and can be added later without a breaking change if a real consumer asks
  for it.
- **The inverse `consumers` index is computed once, inside
  `buildDependencyModel()`**, by inverting `contracts[].consumingFiles` --
  not by re-scanning, and not exposed as a second entry point.
- **Graph-format rendering (DOT, Mermaid, a raw `{nodes, edges}` JSON) is
  explicitly not part of this model.** That's presentation over
  `DependencyModel`'s data, which belongs in a projection (the
  "Configuration Dependency" reference projection, once
  `defineEvidenceProjection()` exists), not baked into the fact model
  itself -- the same fact-vs-projection split ADR 0024 draws everywhere
  else.

## Consequences

- `DependencyModel.contracts[].variables[].lines` gives a consumer (or a
  future SARIF/annotation renderer) a real line to point at, where today
  only "used"/"unconsumed"/"indeterminate" exists.
- A consumer asking "what does this file actually depend on" no longer has
  to invert `OwnershipDependencyEntry[]`'s `consumers: string[]` by hand --
  `DependencyModel.consumers` already is that index.
- `dependency-graph.ts`/`scan-dependencies.ts` remain exactly as
  unexported and free to change shape as ADR 0010 already established --
  this decision adds a consumer of their _output_, not a new contract on
  their _internals_.

## Alternatives considered

- **Export `buildDependencyGraph()`/`scanFileForDependencies()` directly,
  now that a real use case (this fact model) exists.** Rejected -- ADR
  0010's "no real external use case" reasoning was never the _only_
  argument against exporting the engine; the graph's internal shape
  (`BuildingContract`, two-pass mutation state) is genuinely an
  implementation detail that should stay free to change without a semver
  concern, even once something real is built on its _output_.
- **Attribute line numbers per consuming file**, not aggregated across all
  of them. Rejected for this phase as more scope than the identified gap
  needed -- the audit's ask was "line numbers exist somewhere reachable,"
  not "know which file each one came from." Revisit if a real projection
  needs the finer grain.
- **Build the graph-export renderer (DOT/Mermaid/JSON) now, alongside the
  model.** Rejected -- see Decision above; this is projection work, and
  building it ahead of `defineEvidenceProjection()` would either mean a
  privileged non-projection code path (against ADR 0024's "no privileged
  path" rule) or premature commitment to a renderer shape before the
  projection API exists to house it properly.
