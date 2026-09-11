# 0036: Exact source-position evidence — `SourcePosition`, three declaration positions, retained dynamic-access sites, and named scan surfaces

## Status

Accepted. Implemented (Part 2a only — developer-declared dynamic-access citations and
acknowledgment freshness are a separate, not-yet-implemented follow-on, tracked as Part 2b).

## Context

Every fact env-cap derived pointed at a _file_, never a _place within it_. `scanFileForDependencies()`
(`src/build/scan-dependencies.ts`) already walked the real TypeScript AST and already computed a
line number for every access site, but discarded the column (`.character`) it had already computed
alongside it. `dependency-graph.ts`'s per-variable `lines: readonly number[]` aggregated line
numbers across every consuming file with no way to tell which file a given line came from once a
variable was read from more than one place. Dynamic (computed) property access collapsed into a
single `hasDynamicAccess: boolean` per contract — the specific sites that set it were computed and
then discarded, never retained. A contract's `createEnv()` call, its optional `documentEnv()` call,
and each variable's own schema property are three different declarations with three different real
answers to "where is this"; nothing distinguished them. `EvidenceReference` had no position field
at all. The usage-scan surface `buildDependencyGraph()` walked was narrower than what a report
implied: `packages` (ADR 0014) resolved each allow-listed package's schema file for cross-package
contract _discovery_, but never added that package's own source into the _usage-scan_ surface — so
"unconsumed" only ever meant "no consumer found in this project's own root," a materially narrower
claim than what the rendered prose suggested.

Closing all of this turned out to be mostly wiring already-computed positions through to the public
model, not new AST capability — the same kind of move ADR 0027 already made once for member-access
line numbers.

## Decision

- **One reusable `SourcePosition` type**, in a new `src/build/source-position.ts`:
  `{ file: string; line: number; column: number }`, both 1-indexed. A `positionOf(sourceFile, node)`
  helper computes `{ line, column }` from any AST node; every caller combines it with the file it's
  already scanning. Every `AccessSite` variant (`scan-dependencies.ts`) gained `column`.
  `VariableAccessInfo.lines: readonly number[]` became `positions: readonly SourcePosition[]` — each
  entry now carries its own `file`, closing the "which file did this line come from" gap, not just
  adding a column to the old file-less shape.
- **Dynamic-access sites are a retained list, not a boolean.** `dynamicAccessSites: SourcePosition[]`
  is appended to at every computed-property-access site `dependency-graph.ts` observes.
  `hasDynamicAccess` stays, now simply `dynamicAccessSites.length > 0` — existing boolean consumers
  are unaffected. `DEPENDENCY_MODEL_SCHEMA_VERSION` bumped 1 → 2. `IndeterminateOwnershipFinding`
  gained the same `dynamicAccessSites`, and its generated prose now cites exact `file:line:column`
  sites instead of naming only the contract.
- **Three distinct declaration positions, never collapsed into one.** `DiscoveredContract` gained
  `declaration: SourcePosition` (the `createEnv()` call, always present) and
  `documentation: SourcePosition | undefined` (the `documentEnv()` call, if one exists — a
  genuinely different location, and "not yet documented" is a real, distinct state from "documented
  right here"). Each variable's own `DiscoveredSchemaVariable`/`DiscoveredVariable` gained its own
  `declaration: SourcePosition`, sourced from its schema-object property, distinct from either
  contract-level position. `ContractModel`/`ManifestSnapshot`-downstream consumers thread all three
  through under these exact names — never `position`/`declarationLine` standing in for all of them —
  so a future contributor can't accidentally re-merge them without the type itself pushing back.
- **Usage-scan surface extended to allow-listed `packages`, with an explicit, bounded root.** Each
  package's own resolved `packageDir` (already available from `resolveAllowlistedPackages()`, ADR 0014) is walked with the exact same `discoverSchemaFiles()` + `SCAN_INCLUDE`/`DEFAULT_EXCLUDE`
  policy the local root scan already relies on — never a bespoke, unbounded directory walk. Every
  surface actually scanned is named: `DependencyModel.scannedSurfaces: readonly { label: string;
root: string }[]`, always at least one entry (`{ label: "application", root: "." }`) even with no
  `packages` configured. Every usage-derived conclusion (`unconsumedOwnedVariables`, `indeterminate`)
  is attributable to a named entry in this list; rendered prose (`usage-report.ts`) says exactly
  "Searched: application; package:\<name\>." rather than a vaguer "the application."
- **`EvidenceReference` gains an optional-by-value, always-present-by-shape `position` field.**
  `ContractEvidenceReference` and `OwnershipEvidenceReference` both gained
  `readonly position: SourcePosition | undefined` — present on every reference, `undefined` where no
  single position is more relevant than another (e.g. `indeterminate-ownership`, which has multiple
  candidate sites — see `IndeterminateOwnershipFinding.dynamicAccessSites` for the full list
  instead). `Finding.location`'s ten construction sites in `finding-model.ts` all set this field
  explicitly (never omit it — the field's own type requires the key to be present even when its
  value is `undefined`), but none of them populate a real position yet: none of
  `finding-model.ts`'s current inputs (`CompatibilityIssue`, `DocumentationFindings`'s sub-types,
  `usage-report.ts`'s finding types) carry a `SourcePosition` themselves. That's real,
  separate, not-yet-started follow-up work — threading `declaration`/`documentation` through each of
  those intermediate finding types — not something faked here. `position: undefined` is an honest
  value, not a placeholder.

## Consequences

- `DependencyModelVariable.lines: readonly number[]` is gone; `positions: readonly SourcePosition[]`
  replaces it. `DEPENDENCY_MODEL_SCHEMA_VERSION` 1 → 2. Every consumer of the old shape (tests,
  reference projections in `evidence-projections`) needed updating.
- `ContractModelContract`/`ContractModelVariable` gained `declaration`/`documentation` fields;
  `CONTRACT_MODEL_SCHEMA_VERSION` 1 → 2.
- `scanFileForDependencies()`'s public `AccessSite` shape gained `column` on every variant — a
  strictly additive field, but every hand-written fixture asserting an exact `AccessSite` array
  needed its expected column added.
- A reference-projection helper (`test/integration/positive/enterprise/evidence-projections/
projections/lib/to-discovered-contracts.mjs`) reconstructs a `DiscoveredContract[]`-compatible
  shape from Contract Model by hand; it's a plain `.mjs` file with no compile-time enforcement
  against the real `DiscoveredContract` type, so it can silently drift when that type gains fields.
  This ADR's implementation found it still reading the pre-ADR-0035 `variable.extra` (renamed to
  `metadata`) and missing all five of ADR 0035's new fields — fixed as part of this pass, not a new
  gap this ADR introduces, but worth naming since nothing currently prevents it from recurring.
- Several example/fixture schemas (`examples/application/src/env.ts` and four fixtures under
  `test/integration/`) still declared bare `setup`/`documentation` keys directly on a `VariableDocs`
  object literal — valid under the pre-ADR-0035 open index signature, but a hard `TS2353` excess-
  property error under ADR 0035's closed `VariableDocs` shape. This had gone unnoticed because
  `generate:env` (a plain AST scan, not a `tsc` check) doesn't fail on it, and each fixture's own
  `npm run typecheck` is a separate, per-directory command never exercised by the root project's own
  `npm run verify`. Fixed by moving each into `metadata: { setup: ..., documentation: ... }`. Flagged
  here because it's the second time in this same implementation pass that a real regression only
  surfaced by explicitly running every fixture's own `typecheck`/test suite rather than trusting the
  root project's green `npm run verify` alone — worth remembering for any future breaking change to
  a type example/fixture source actually authors against.
- `Finding.location.position` exists on every `Finding` today but is always `undefined` in practice
  — real population is Part 2a's one deliberately deferred item, left for whenever a consumer
  actually needs it (the `enterprise-platform` configuration-governance projection, Part 3, is the
  first candidate).

## Alternatives considered

- **One shared declaration position instead of three.** Rejected — collapses "where is this
  variable declared," "where is this contract declared," and "where is this contract documented"
  into one answer, losing exactly the distinction a citation-heavy report most needs.
- **A naive recursive walk of each allow-listed package's entire directory for usage-scanning.**
  Rejected — a package root routinely contains `node_modules/`, build output, fixtures; walking all
  of it would be both slow and wrong. Reusing the existing `discoverSchemaFiles()` +
  `SCAN_INCLUDE`/`DEFAULT_EXCLUDE` policy against each package's own resolved root was already
  available and already exercised by the local-root scan.
- **Populating `Finding.location.position` in this same pass by inventing placeholder positions
  (e.g. the contract's `declaration` for every finding regardless of what the finding is actually
  about).** Rejected — a position that doesn't actually correspond to what the finding describes is
  worse than no position at all; `undefined` is honest, a wrong guess is not.
