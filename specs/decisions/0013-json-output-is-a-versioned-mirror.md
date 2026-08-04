# 0013: `--json` Is a Versioned Mirror of `GenerateEnvArtifactsResult`, Not a New Derived Shape

## Status

Accepted.

Implemented in:

- `src/build/docs.ts` (`buildCatalog()`, `CatalogVariable`/`CatalogContract`)
- `src/build/generate-documentation.ts` (`GenerateDocumentationResult.catalog`)
- `src/cli/json.ts`
- `src/cli/index.ts`
- `action.yml`
- `scripts/github-action/report.mjs`

## Context

`generateEnvArtifacts()` already computes a fully structured result -- undocumented
variables, expiring secrets, ownership/blast-radius data, exclusive-group violations --
but the CLI (`src/cli/index.ts`) only ever rendered it as hand-formatted
`process.stdout.write(...)` text. A platform team wanting this data in CI checks, PR
annotations, or a fleet-wide dashboard had to scrape human-readable output. `--json`
closes that gap. A first-party GitHub Action was added alongside it as the concrete
"platform team" consumer this data now serves.

While designing `--json`, a second gap surfaced: `GenerateDocumentationResult` carried
_findings about_ the documentation (undocumented/stale/expiring) but never the
documentation itself. `renderDocs()` builds the rich Markdown Catalog from the full
`DiscoveredContract[]`/`DiscoveredVariable[]` graph, but that graph was discarded after
rendering -- `contracts` was only a `DiscoveredContractSummary[]` (file/exportName/
contractName/variableCount/active/documented, no per-variable metadata). `--json` as
originally scoped would have given a platform team every _problem_ but none of the
actual _catalog_. `docs.catalog` (Part 1) closes that gap first.

## Decisions

1. **`--json` mirrors `GenerateEnvArtifactsResult`/a thrown error's `.issues` inside a
   thin `{ schemaVersion, kind, toolVersion, ok }` envelope.** No new, richer, or
   derived shape is invented -- notably, no stored `blastRadius` field (see decision 3).
   Serialization lives in its own module, `src/cli/json.ts`
   (`serializeSuccess`/`serializeFailure`/`writeJson`), not inlined in `main()`, so the
   contract has one canonical owner, is unit/snapshot-testable without stdout spying,
   and the CLI's control-flow function doesn't become the de facto owner of a public
   contract.

2. **The GitHub Action's exit code is always exactly the CLI's own exit code.**
   `--json` only changes formatting; pass/fail is still governed entirely by
   `--strict`/`--strict-docs`/`--strict-ownership` and the always-hard-error
   exclusive-group check. `action.yml`'s final step is a bare `exit
${{ steps.run.outputs.exit-code }}` -- the Action must never introduce a second,
   independent pass/fail policy of its own.

3. **Presentation concerns belong in the Action's renderer, not in the CLI or
   `src/build`.** Severity-level mapping for annotations (error/warning/notice),
   Markdown rendering, and blast-radius arithmetic all live in
   `scripts/github-action/report.mjs`. `consumers.length` is computed there on demand,
   consistent with `usage-report.ts`'s existing Markdown renderer doing the same thing
   (`src/build/usage-report.ts`'s `renderDependencyOwnershipTable()`) -- no new field is
   added to `OwnershipDependencyEntry` to store it redundantly. The CLI's job is to expose data;
   the Action's job is to decide how GitHub should present it.

4. **Field/key ordering in the JSON output is not part of the contract.** Consumers
   must not rely on it. Ordering _within_ an array (e.g. `manifest.contracts`,
   `docs.documentation.undocumentedVariables`) is inherited from
   `generateEnvArtifacts()`'s own already-deterministic computation --
   `discoverSchemaFiles()` sorts discovered files alphabetically, and downstream lists
   are built by iterating that order. The JSON layer does no additional sorting of its
   own; a nondeterministic list is a `src/build` discovery/computation fix, never
   something to patch in the CLI's serialization or the Action's rendering.

5. **`schemaVersion` increments only on a breaking change** -- an existing field's type
   or meaning changes, or a field is removed. Never for a purely additive field.
   Consumers must ignore unknown top-level and nested properties, at any version, so
   the payload can grow without a version bump. `toolVersion` (the installed package's
   own `package.json#version`, resolved once via `import.meta.url` so it reflects the
   real installed package regardless of `npx`/local devDependency/global install) is a
   separate field answering a separate question: `schemaVersion` says "can I safely
   parse this," `toolVersion` says "which release produced it" -- e.g. three apps in
   the same org on different `env-cap` patch/minor versions can all emit
   `schemaVersion: 1` while `toolVersion` still lets a consumer identify a known
   per-release quirk or drive an upgrade recommendation.

6. **Streaming/incremental output (JSON Lines, `--watch`) is explicitly out of scope.**
   `--json` always emits exactly one atomic report per invocation, matching
   `generateEnvArtifacts()`'s own atomic compute/write guarantee. A future streaming
   mode, if ever justified, should be a distinct flag/format, not a variant of this one.

7. **Exporting `src/cli/json.ts`'s payload/error TypeScript types as a public API was
   considered and deliberately deferred.** `src/cli` isn't one of the package's three
   public entry points (`.`, `./build`, `./helpers`), and no real external consumer
   need has been demonstrated yet. The JSON _shape_ is documented and stable regardless
   of whether TS types for it are exported -- the JSON payload itself is the canonical,
   stable contract. If types are exported later, they must mirror the documented JSON
   shape, not the other way around; a TS interface is never the source of truth for
   what's on the wire.

8. **`GenerateDocumentationResult.catalog` is keyed by variable name within each
   contract, but the top-level list of contracts is an array, not a map keyed by
   `contractName`.** A variable key is guaranteed unique within one contract (a schema
   object-literal property name); `contractName` is not guaranteed unique across files
   -- two unrelated contracts can legitimately share a name, and a
   `Record<contractName, CatalogContract>` would let the second silently clobber the
   first. Arbitrary author-supplied `documentEnv()` metadata (`CatalogVariable.extra`,
   `CatalogContract.metadata`) is always its own nested property, never spread onto the
   same object as reserved fields -- structurally, not by naming convention, so a
   user's own field name (e.g. an extra key literally called `documented` or
   `required`) can never silently override a reserved one. Any future field added to
   `CatalogVariable`/`CatalogContract` must preserve this: extend the object with a new
   named field, never widen what gets merged from `extra`/`metadata`.

9. **`catalog` lives on `GenerateDocumentationResult` itself, not a new standalone pass
   or type.** Considered and rejected as a false separation: `catalog` is unavoidably
   built from `docsContracts`, the live-expiration-resolved graph that
   `generate-env-artifacts.ts` only computes when a `docs` pass is actually requested
   (see ADR 0012). A standalone `generateEnvCatalog()` would either duplicate that
   resolution step or still secretly depend on `docsOptions` to be correct -- moving the
   field elsewhere wouldn't remove the coupling, only hide it. `catalog` also isn't a
   new category of data bolted onto a findings-only type; `contracts:
DiscoveredContractSummary[]` already _is_ a catalog, just a truncated one --
   `catalog` completes it at full per-variable detail, the same way
   `generateDocumentation()`'s own doc comment already describes its job as writing the
   rich Markdown "Catalog".

## Consequences

- A consumer parsing `--json` output must branch on `ok` and otherwise treat the
  payload defensively: read only known fields, tolerate additional ones, and never
  assume key order.
- Any change to `GenerateEnvArtifactsResult` (or the types it's built from) is
  simultaneously a change to a public, versioned wire contract -- not just an internal
  refactor. Whether it needs a `schemaVersion` bump per decision 5 is part of making
  that change, not an afterthought.
- The GitHub Action's `report.mjs` and the JSON contract are coupled by convention, not
  by a shared type (`report.mjs` is plain JS, no dependency on `src/cli/json.ts`'s
  types per decision 7) -- keeping the two in sync across a payload change is a manual
  discipline, called out in `skills/env-cap/SKILL.md`'s Maintainer Notes.
