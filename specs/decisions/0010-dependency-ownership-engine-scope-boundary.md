# 0010: The Dependency-Ownership Engine's Scope Is Fixed and Its Internals Are Not a Public API

## Status

Accepted. Implemented in `src/build/scan-dependencies.ts` and
`src/build/dependency-graph.ts`, orchestrated by `generateUsageReport()`
(`src/build/generate-usage.ts`). Referenced, but not previously written down
as its own decision, by comments in both files and in `src/build/index.ts`.
Backfilled by this ADR.

## Context

`generateUsageReport()` answers a different question than
`generateEnvManifest()`/`generateDocumentation()`: not "what contracts
exist," but "who actually imports and reads each one, and what would break if
it changed or disappeared." Answering that requires a second static-analysis
pass, structurally similar to schema discovery but broader in what it scans
and different in what it's allowed to conclude:

- **What it scans is deliberately not configurable.** `SCAN_INCLUDE =
["**/*.ts", "**/*.tsx"]` (`generate-usage.ts`) is a fixed constant, not an
  option a caller can override, unlike `include`/`exclude` for schema
  discovery. Usage can occur in any source file in the project, so there is
  no meaningful narrower default to offer, and letting a project quietly scope
  this down (e.g. to exclude a directory) would silently produce false
  "abandoned" findings for contracts only consumed from the excluded area --
  exactly the false-positive risk this feature exists to avoid.
- **What it's allowed to conclude is deliberately conservative.**
  `dependency-graph.ts`'s two-pass design distinguishes contracts that are
  never imported (`abandoned`) from contracts reachable only through an
  unresolved barrel/wildcard re-export (`unresolvedConsumers`) -- see
  `deriveOwnershipFindings`'s doc comment. A barrel chain
  (`export * from "./somewhere"`) is recorded as ambiguous
  (`hasWildcardReExport`) but never traced to find out what it actually
  forwards. Tracing it would mean resolving an unbounded chain of re-exports
  across files this engine doesn't already know are schema-relevant --
  scope creep with no natural stopping point, for a feature whose entire
  value proposition is that its findings are provable, not heuristic.
- **Its internals are not exported from `env-cap/build`.** `scan-dependencies.ts`'s
  AST-access-site vocabulary (`AccessSite`, `FileScanResult`) and
  `dependency-graph.ts`'s graph-building machinery
  (`buildDependencyGraph`, `deriveOwnershipFindings`) are used only by
  `generateUsageReport()` internally. `src/build/index.ts`'s public surface
  stops at the ownership-framed result types
  (`OwnershipDependencyEntry`, `AbandonedContractFinding`, etc.) that
  `generate-usage.ts` maps the raw graph into.

## Decision

1. `SCAN_INCLUDE` stays a fixed, non-configurable constant. A project that
   needs different scanning boundaries is a signal the engine's convention
   doesn't fit that project's layout, not a signal to add a configuration
   point.
2. Barrel/wildcard re-export chains are recorded as ambiguous and reported
   as `unresolvedConsumers`, never traced further and never used to promote
   a contract to `abandoned` or to silently assume it's consumed.
3. The AST-level scanning/graph-building internals
   (`scan-dependencies.ts`, `dependency-graph.ts`) are not exported from
   `env-cap/build`. Only the ownership-framed result of
   `generateUsageReport()` is public.

## Consequences

- `generateUsageReport()`'s findings stay trustworthy enough to gate CI on
  (`onOwnershipIssue: "throw"`) precisely because they're never the product
  of an unbounded or configurable search -- a false "abandoned" finding
  blocking a release would erode the one property (provable, not
  heuristic) that makes this check worth having.
- A project with an unusual layout that defeats `SCAN_INCLUDE` in practice
  (e.g. TypeScript source outside `.ts`/`.tsx` extensions) simply won't get
  useful ownership findings for that area -- there's no escape hatch, by
  design, matching the same "no knob nobody's asked for yet" reasoning as
  0009's exclusive-group check.
- `env-cap` answers ownership/visibility questions about the contracts it
  already knows about; it does not ship a general-purpose static-analysis
  toolkit for arbitrary AST queries. A tool wanting the latter should use
  the TypeScript compiler API directly, not treat `scan-dependencies.ts` as
  a stable dependency.

## Alternatives considered

- **Make `SCAN_INCLUDE` configurable, mirroring `include`/`exclude`.**
  Rejected. Unlike schema discovery -- where a project genuinely might want
  to narrow which directories are searched for `env.schema.ts` files --
  narrowing usage-scanning has no safe default: any exclusion risks hiding a
  real consumer and manufacturing a false "abandoned" finding. If a real
  need for this surfaces, it should be a distinctly-named, clearly-scoped
  option, not a blanket reuse of the schema-discovery pattern.
- **Trace barrel/wildcard re-export chains to resolve ambiguous consumers.**
  Rejected as scope creep with no natural bound -- see Context. A future,
  separately-justified decision could revisit this if a bounded, provably
  terminating resolution strategy is found, but none has been proposed.
- **Export `scan-dependencies.ts`/`dependency-graph.ts` for custom tooling,
  the same way lower-level build primitives (`discoverSchemaFiles`,
  `linkFiles`) are exported.** Rejected for now. Those primitives are
  exported because real external use (custom CI scripts, bundler plugins)
  already justifies the commitment to keep their shape stable. No comparable
  external use case for the raw ownership-graph internals has come up; if
  one does, exporting a stable subset of this vocabulary is a future
  decision, not a retroactive justification for exporting it today.
