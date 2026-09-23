# Changelog

## 0.4.0

### Minor Changes

- ab1f435: Wires `internal-package-contract`'s governance in for real (CI now runs the
  full contract as a blocking gate, mutation testing ratcheted to zero
  survived/no-coverage/timeout), adds ISO 10007 and ISO/IEC 27001
  open-standard alignment reports, and adds a Next.js example demonstrating
  the client/server environment boundary.

## 0.3.1

### Patch Changes

- 9059cfa: `overrides` now aliases `puppeteer` -> `puppeteer-core` wherever `pa11y` resolves it -- zero bundled browser, zero Chromium-download postinstall script. A Socket.dev "Install scripts" finding directly hurts this package's own supply-chain score, so this had to go regardless of `pa11y`/`puppeteer` staying real, hard dependencies (no extra install step for anyone).

  Also pins `tar` to `^7.5.22` (a critical hardlink/symlink-traversal CVE, non-breaking fix).

## 0.3.0

### Minor Changes

- Bump to unblock publishing -- 0.2.0 was already published manually to bootstrap npm OIDC trusted publishing (see RELEASING.md), so the registry already holds that exact version and content hash. No functional change beyond the previous release.

### Patch Changes

- 61f387c: Publish as the scoped package `@maverickcer/env-cap` instead of `env-cap` -- npm rejected the unscoped name as "too similar to existing packages" (`env-cmd`, `env-var`). The `env-cap` CLI binary name, `npx env-cap` invocation, and all subpath exports (`/build`, `/node`, `/helpers`, `/evidence`, `/eslint-plugin`, `/schema`) are unchanged; only the install/import specifier changes, e.g. `npm install @maverickcer/env-cap` and `import { createEnv } from "@maverickcer/env-cap"`.

## 0.2.0

### Minor Changes

- a388405: `buildChangeModel()` now correlates a renamed variable's `addedVariables`/`removedVariables` pair (matched via the current declaration's `renamedFrom`, ADR 0029) into a new `ChangeModel.renamedVariables` array, and takes two new parameters -- `currentContracts` and `root` -- to do so. `ManifestChangeReport` itself is unchanged; `renamedVariables` is additive, not a filter over the existing `addedVariables`/`removedVariables`. See [ADR 0030](specs/decisions/0030-change-model-wraps-manifest-change-report.md).
- 93635c0: Add the Change Model: `buildChangeModel()`/`ChangeModel` wrap the existing `ManifestChangeReport` (unchanged) in a versioned, model-namespaced shape, giving it the same standing as env-cap's other canonical fact models. See [ADR 0030](specs/decisions/0030-change-model-wraps-manifest-change-report.md).
- c5d9f3a: `detectCompatibilityIssues()` now sets a stable `code` (`"processor-return-type-conflict"` | `"processor-source-conflict"` | `"validator-source-conflict"`) on every check it runs, matching the `"duplicate-variable-documentation"` code the duplicate-documentation check already set. `CompatibilityIssue.code` is now typed as the new exported `CompatibilityIssueCode` union instead of a bare `string`. First step of the Finding Model work described in [ADR 0024](specs/decisions/0024-fact-model-architecture.md) -- every check now has a stable identifier to key CI filtering, doc-linking, or a future SARIF `ruleId` on.
- Rename `documentEnv()`'s `ContractDocs.name` field to `displayName`. `name` collided with
  `createEnv()`'s unrelated `CreateEnvOptions.name` (a runtime error-message label) -- same word,
  different meaning, on the same conceptual contract. `ContractDocs.name` is removed, not deprecated
  or aliased, because the collision is the reason for this change and aliasing would leave it
  half-fixed.

  This is a **breaking change to a Stable-tier TypeScript API** (`documentEnv`'s `ContractDocs`
  parameter -- `documentEnv` itself is listed under VERSIONING.md's Stable tier). It ships as a
  `minor` release only because `env-cap` is pre-1.0 and VERSIONING.md's major-bump requirement is
  explicitly scoped to "once the package reaches 1.0" -- `minor` here does not mean non-breaking.
  `documentEnv()` is a no-op at runtime (ADR 0001), so the only real-world impact is a TypeScript
  compile error at an existing `{ name: ... }` call site, never a behavior change. Migration: rename
  `name` to `displayName` in any `documentEnv()` call that sets it.

- cff9afd: Add an optional `classification` field to `documentEnv()`'s contract- and variable-level docs (`"secret" | "credential" | "pii" | "config"`), mirroring `owner`'s default-plus-per-variable-override pattern. Statically discovered like every other documentation field -- threaded through `DiscoveredVariable`/`DiscoveredContract` (`env-cap/build`) and the committed manifest change-report snapshot, including field-level diffing when a variable's classification changes between runs. This is the first step of the Contract Model work described in [ADR 0024](specs/decisions/0024-fact-model-architecture.md) -- the one field the whole exposure/secret-hygiene report cluster was previously blocked on.
- 60ca77f: Add the Contract Model: a new, versioned, JSON-serializable projection of every declared environment-variable contract, active or not, including both `documentEnv()` metadata and the AST-derived schema facts (`hasDefault`/`hasProcessor`/`hasValidator`/etc.) that the manifest change-report snapshot deliberately excludes. Exported as `buildContractModel()`/`ContractModel` from `env-cap/build`; its JSON Schema is published at the new `env-cap/schema/contract-model` subpath (a `./schema/*` wildcard export now covers any future per-model schema too, alongside the unchanged `./schema`). See [ADR 0025](specs/decisions/0025-contract-model-json-projection.md).
- cbcbc0d: Add the Dependency Model: `buildDependencyModel()`/`DependencyModel` publish a versioned, JSON-serializable fact-shaped result over the dependency-ownership engine, including an inverse `consumers` index (file -> which contracts it reads, the inverse of the existing contract -> consuming-files view) and per-access-site line numbers that were previously computed but discarded before reaching any type. `dependency-graph.ts`/`scan-dependencies.ts`'s scanning internals stay unexported, unchanged, per [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md) -- see [ADR 0027](specs/decisions/0027-dependency-model-fact-shape-not-engine-access.md) for why publishing this fact doesn't relax that boundary.
- Add five new named `documentEnv()` fields, at both contract and variable level: `purpose`, `legalBasis`, `retentionPolicy`, `dataResidency` (`string | string[]`), and `auditRequired` (`boolean`) -- variable-level values override the contract's own, following the existing `owner`/`classification`/`expiresAt` pattern, via new `effectivePurpose()`/`effectiveLegalBasis()`/`effectiveRetentionPolicy()`/`effectiveDataResidency()`/`effectiveAuditRequired()` exports from `env-cap/build`. Deliberately framework-agnostic (no GDPR/HIPAA/SOC2 vocabulary in the field names) -- a framework-specific citation belongs in the widened `metadata` bag instead. `retentionPolicy` is a descriptive policy statement, never parsed or computed, deliberately independent of `expiresAt`'s actual temporal constraint. Threaded through the Contract Model, Manifest Snapshot, Lifecycle Model, generated docs, and `.env.example`. See ADR 0035.
- `documentEnv()` and `ContractDocs` are now generic over the exact schema type passed to `createEnv()`/`documentEnv()`. `docs.variables`' keys are checked against the schema's own keys at compile time -- documenting a variable that was renamed, removed, or simply mistyped is now a type error at the `documentEnv()` call site itself, instead of a silently-accepted key the generator only reports as "stale" after the fact. Passing the schema object literal (or a `const`-inferred reference to it) gives the strongest inference; explicitly widening `schema` to the bare `EnvSchema` type falls back to the previous behavior (any string key accepted).
- Add developer-declared dynamic-access citations: a new `dynamicAccess?: readonly string[]` field on `documentEnv()`'s per-variable docs, each entry a `"path:line:column"` citation of where a variable is actually read outside what env-cap's static AST scan can see (a shell script, a Docker entrypoint, a sibling service). `VariableAccessStatus` stays exactly 3-valued and purely AST-derived -- a citation is modeled as a wholly separate, independent `dynamicAccessAssertions` fact on `DependencyModelVariable`, each with its own re-derived-every-run `"fresh" | "stale" | "missing"` acknowledgment (a SHA-256 content-hash comparison against a committed baseline in the manifest snapshot, mirroring the existing `renamedFrom`/`expiresAt` pattern). Only a fresh assertion suppresses the corresponding `unconsumed-owned-variable`/`indeterminate-ownership` finding -- and never silently: the variable is instead reported in a new `asserted` category (rendered as "## Asserted (developer-acknowledged dynamic access)" in the Dependency & Ownership Report), always showing the raw AST-derived status alongside the citation. A citation that goes stale or missing raises a new `Finding` (`dynamic-access-citation-stale`/`dynamic-access-citation-missing`) on the very next run. See ADR 0037.
- Finish wiring `classification` through the pipeline, matching the treatment its sibling
  documentation fields (`owner`, `purpose`, `legalBasis`, `retentionPolicy`, `dataResidency`,
  `auditRequired`) already get: a new `effectiveClassification()` helper (`env-cap/build`,
  internal like its siblings other than `effectiveOwner()`) resolves a variable's own classification,
  falling back to its contract's; the effective value now renders as a `- Classification:` line in
  generated docs and appears on `CatalogContract`/`CatalogVariable`'s JSON shape (a purely additive
  field); and two documented declarations of the same variable that disagree on `classification` now
  produce a `duplicate-variable-documentation` compatibility warning, the same as an `owner`/
  `description` mismatch already does -- this can surface a _new_ warning for a project whose
  contracts already silently disagree on classification, worth checking before enabling
  `onIncompatibility: "throw"`.
- fc96fa2: Add an `onExisting` option to `.env.example` generation (`envExample.onExisting` on `generateDocumentation()`/`generateEnvArtifacts()`, `--env-example-on-existing` on the CLI): `"keep-sibling"` (default, unchanged behavior — never overwrites, writes a timestamped sibling instead), `"overwrite"` (replace the existing file directly), or `"skip"` (write nothing when a file already exists).
- c81d1e4: Adds a 5th public entry point, `env-cap/evidence` (Experimental), exporting `defineEvidenceProjection()` -- a pure, isomorphic transform from the immutable `EvidenceModel` (ADR 0024) to any consumer-defined output shape. Every projector's `EvidenceModel` argument is wrapped in a read-only tracking Proxy that throws on any mutation attempt and automatically records which field paths were read, surfaced via the projection's `.project(evidence)` method alongside the computed value. See ADR 0031 (the new entry point) and ADR 0032 (the provenance mechanism, including why it clones rather than relying on `Object.freeze()`).
- Export `SourcePosition`, `DynamicAccessAssertion`, and `ScannedSurface` from `env-cap/build` -- these shapes were already referenced by public fields (`ContractModelContract.declaration`/`.documentation`, `ContractModelVariable.declaration`, `DependencyModelContract.dynamicAccessSites`, `DependencyModelVariable.positions`/`.dynamicAccessAssertions`, `DependencyModel.scannedSurfaces`) since ADR 0036/ADR 0037, but the types themselves were never nameable by a consumer writing their own projection or tooling against those fields.
- Rename two `FindingCode` values to match the adjective-first word order every other code in the
  union uses: `"dynamic-access-citation-missing"` -> `"missing-dynamic-access-citation"`, and
  `"dynamic-access-citation-stale"` -> `"stale-dynamic-access-citation"`. `FINDING_MODEL_SCHEMA_VERSION`
  bumped from 1 to 2. This is a rename, not an additive union member -- the old strings are no
  longer produced anywhere. `FindingModel`/`EvidenceModel` are Experimental (VERSIONING.md), so this
  ships without a major bump; a consumer matching on these exact `code` strings (in a projection, CI
  filter, or dashboard) needs to update them.
- beea60a: Add the Finding Model: `buildFindingModel()`/`Finding`/`FindingModel` unify `CompatibilityIssue`, `ArtifactCheckFinding`, `DocumentationFindings`, and the four `usage-report.ts` ownership findings into one shape with a required, stable `code`, a coarse `family` discriminant, and a structured `location: EvidenceReference` pointer instead of a formatted string. All four existing finding types are unchanged -- this is purely additive. Also adds the new `EvidenceReference` type (`ContractEvidenceReference` | `OwnershipEvidenceReference` | `ChangeEvidenceReference`), the structured-location vocabulary the Finding Model and, later, `defineEvidenceProjection()` build on. See [ADR 0026](specs/decisions/0026-finding-model-unifies-four-families.md).
- dadba33: Adds `generateEvidenceModel()` (`env-cap/build`, Experimental) -- the assembly orchestrator that runs schema discovery and linking once, then builds all seven canonical fact models (Contract, Dependency, Ownership, Lifecycle, Finding, Change, Evidence) by calling each model's own public builder directly, `deepFreeze()`s the result, and stamps provenance (a fresh `generatedAt`, env-cap's own `toolVersion`, and an optional caller-supplied `commit`). Unlike `generateEnvManifest()`/`generateDocumentation()`/`generateUsageReport()`/`generateEnvArtifacts()`, it never throws on a data-quality finding -- every compatibility issue, undocumented variable, abandoned contract, and similar shows up as a `Finding` in the returned model instead, by design.
- Add "Joined Variable View" as an eleventh first-party reference projection, alongside the original
  ten from ADR 0024, in `test/integration/positive/enterprise/evidence-projections/`
  (`projections/joined-variables.mjs`). One row per declared variable, joining Contract Model,
  Dependency Model, and Lifecycle Model by `${file}#${exportName}#${key}` identity, with a fixed and
  documented field list -- a working, copyable example of the cross-model join every one of the
  other ten projections performs its own version of, for a `defineEvidenceProjection()` author to
  start from instead of re-deriving it. Shipped as an example, not a package export -- see ADR
  0033's "Alternatives considered" on why a public entry point exporting ready-made projections was
  rejected; this doesn't reopen that decision.
- 13cb26e: Add `deprecated`/`deprecatedReason`/`removeBy`/`renamedFrom` to `documentEnv()`'s per-variable docs (`deprecated`/`deprecatedReason` also at the contract level), threaded through the same static-analysis path every other documentation field follows -- `DiscoveredContract`/`DiscoveredVariable`, and the committed manifest change-report snapshot with field-level diffing. Add the Lifecycle Model: `buildLifecycleModel()`/`LifecycleModel` promote the existing `ExpiringEntry`/`computeExpiringEntries()` into a canonical, versioned shape (`expiring`), plus a new `contracts` array carrying every lifecycle-relevant fact for contracts/variables that set at least one. See [ADR 0029](specs/decisions/0029-lifecycle-model-deprecation-rename-fields.md).
- fc96fa2: `generateEnvManifest()`/`generateEnvArtifacts()` now track `documentEnv()` metadata changes across runs: a new `changes` field on the manifest result (also in `--json`/CLI output) reports contracts and variables added, removed, or updated since the last run, with field-level before/after values. Backed by a new committed sidecar snapshot file next to the manifest (`<location>.snapshot.json` — see [ADR 0021](specs/decisions/0021-manifest-change-report-persisted-snapshot.md)).

  Also adds a new `duplicate-variable-documentation` warning: two active contracts documenting the same variable key with different `description`/`owner`/`expiresAt`/`refreshInstructions`/`required`/`extra` now produce a warning (never a hard error) naming exactly which fields diverge, alongside the existing processor/validator compatibility checks. `CompatibilityIssue` gains an optional `code` field, populated for this new check.

- 72fc1a8: Add an `optional()` validator to `env-cap/helpers`: passes automatically when the value is `undefined`, otherwise delegates to the wrapped validator. Useful for validating optional environment variables (e.g. `validators.optional(validators.url())`) without hand-writing the `undefined` check.
- 772d743: Add the Ownership Model: `buildOwnershipModel()`/`OwnershipModel` publish every contract and variable's effective owner, plus first-class `unownedContracts`/`unownedVariables` arrays -- previously only a count (`noOwnerCount`) inside `docs.ts`'s rendered security-review text. Also exports `effectiveOwner()` (relocated from `docs.ts` to `link.ts`) as reusable public surface. See [ADR 0028](specs/decisions/0028-ownership-model-shared-effective-owner.md).
- 7b585f9: Remove the `notDefault()` and `notOneOf()` validators from `env-cap/helpers` -- rarely used, and part of bringing `dist/helpers.js` back under its 3072-byte gzip budget (see [ADR 0008](specs/decisions/0008-gzip-size-budget.md)). Equivalent behavior is still directly expressible with existing validators: `validators.not(validators.oneOf([...]))` covers both `notDefault` and `notOneOf`.

  Every built entry point (`dist/index.js`, `dist/helpers.js`, `dist/build.js`, `dist/cli/index.js`, `dist/eslint-plugin/index.js`) also no longer ships source comments -- esbuild's unminified default otherwise preserved every JSDoc comment verbatim, which was pure dead weight against the gzip budget (declarations, and the IDE hover they drive, come from a separate `tsc` pass, never from these `.js` files). No identifiers are mangled and no syntax is rewritten, so a debugger stepping into `dist/*.js` still reads like the source.

- 7237e13: Extracts `renderDocs()`'s security-review counters (total/active variables, expired/expiring-soon counts, unowned/duplicate-name counts, undocumented counts) into a new exported `computeSecurityReviewCounters()`/`SecurityReviewCounters` from `env-cap/build`, instead of only ever becoming rendered Markdown text. The rendered "Security review" section is unchanged, byte-for-byte. Also dedupes the days-remaining arithmetic that was previously implemented three times (`computeExpiringEntries`, the lifecycle report, and the security review) into one shared internal helper. Part of the Finding Model groundwork described in [ADR 0024](specs/decisions/0024-fact-model-architecture.md).
- Add `setupInstructions` to `VariableDocs`/`ContractDocs` (`documentEnv()`) -- "how to get a value the first time" (provisioning, requesting access, generating a secret), distinct from the existing `refreshInstructions` ("how to rotate it once you have one"). Threaded through the Contract Model, manifest snapshots, generated `ENVIRONMENT.md` (its own `- Setup instructions:` line, before `Refresh instructions`), and generated `.env.example` (a `# Setup:` comment, before `Expires At`).
- Add exact source-position evidence throughout the build pipeline, exported as a new `SourcePosition` type from `env-cap/build`. `ContractModelContract` gains `declaration` (its `createEnv()` call, always present) and `documentation` (its `documentEnv()` call, when one exists) -- two distinct positions, never collapsed into one. `ContractModelVariable` gains its own `declaration` (the variable's schema property). `DependencyModelContract` gains `dynamicAccessSites: readonly SourcePosition[]`, retaining every computed (dynamic) property-access site observed, not just a `hasDynamicAccess` boolean. `DependencyModel` gains `scannedSurfaces: readonly { label: string; root: string }[]`, naming every surface actually scanned for usage -- the application root plus one entry per allow-listed `packages` (ADR 0014) source -- so "no consumer found" claims are never stronger than what was actually searched. `EvidenceReference`'s contract/ownership variants gain an optional `position: SourcePosition | undefined` field for future findings to point at an exact location. `CONTRACT_MODEL_SCHEMA_VERSION` bumped 1 -> 2. See ADR 0036.
- 7c84ad4: Add Experimental TypeScript path-alias resolution. A new `tsconfig` option (and CLI `--tsconfig <path>` / `--no-tsconfig`) on `generateEnvManifest()`/`generateDocumentation()`/`generateUsageReport()`/`generateEnvArtifacts()` resolves import specifiers written as `tsconfig.json` path aliases (e.g. `"@/lib/env.schema.js"`) during static analysis, so a contract or `documentEnv()` call reached only through an alias isn't misreported as abandoned, unresolved, or undocumented. Unlike cross-package discovery's `packages` option (ADR 0014), this is on by default -- `tsconfig.json` at `root` is auto-detected automatically, matching `tsc`'s own behavior, since a project's own tsconfig never crosses the trust/versioning boundary an installed package does. Pass an explicit path for a monorepo whose relevant config isn't at `root`, or `false` to disable entirely. The actual `paths`/`baseUrl` matching is delegated to the TypeScript compiler itself and never resolves into `node_modules` -- that boundary remains exclusively `packages`'. See [ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md) and `examples/tsconfig-aliases` for a runnable demonstration -- `examples/tsconfig-aliases-consumer` additionally proves this composes correctly with cross-package discovery (ADR 0014) in one real install.
- 7b585f9: Add generic, framework-agnostic validation contexts. A schema entry may declare a `context` (e.g. `"server"`, `"production"`, `"worker"` -- entirely application-defined, never interpreted by env-cap), and `validateEnv()` accepts the `activeContexts` active for a run. A variable with no `context` always participates; a variable with a `context` participates only when `activeContexts` includes it, otherwise it's skipped entirely (no default/processor/validator runs, and it stays in its not-ready state). Existing schemas that never set `context` are unaffected. Generated docs and `.env.example` surface a variable's validation context alongside a caveat that it's a participation filter only, not a bundling/security boundary or an authorization mechanism. When at least one variable declares a `context`, the generated manifest also exports `activeContexts` -- every context found across its (active) contracts -- so application code can pass it straight to `validateEnv()` without hand-typing the list. See [ADR 0022](specs/decisions/0022-validation-contexts.md).

### Patch Changes

- 37de92f: Genericizes `live-expirations.ts`'s private, `DiscoveredContract[]`-hardcoded `deepFreezeContracts()` into a new, exported `deepFreeze<T>(value: T): T` (`env-cap/build`). No behavior change for `resolveLiveExpirationDates()`, which now calls the generic version internally.
- Generated docs (`renderDocs()`/`--docs`) and the dependency & ownership report
  (`renderUsageReport()`/`--ownership`) now each print a one-line "Produced by `env-cap --docs`"/
  "Produced by `env-cap --ownership`" note under their heading, so the generated file itself names
  the CLI flag that produced it. Purely additive Markdown; no shape change, no CLI/API change.
- fc96fa2: Fix `--check` (and `checkEnvArtifacts()`) always reporting the `docs` artifact as stale on the very first check immediately following a project's very first-ever documentation generation, with no real drift involved. `renderDocs()`'s "Changes since last report" section now renders "No changes." on a true first run too, instead of being omitted — the omission broke the fixed-point property `--check`'s comparison depends on (regenerating using a file's own content as `previousContent` must reproduce that file exactly). See [ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md).
- d57c854: Fixes `LifecycleModel.expiring[].file` to be root-relative and POSIX-separated, matching `LifecycleModelContract.file` and every other canonical model's file convention -- it previously leaked an absolute, machine-specific filesystem path (`buildLifecycleModel()` called `computeExpiringEntries()` without relativizing its result, unlike the rest of the model). `ExpiringEntry`'s own doc comment (an absolute path) still applies to `computeExpiringEntries()`'s other direct consumers (e.g. `DocumentationFindings.expiringSoon`), which are unaffected.
- Generalize `documentEnv()`'s `metadata` from a contract-only, string-valued field into a symmetric `Record<string, unknown>` field available at both contract and variable level, accepting any primitive or object value per key. `VariableDocs`'s previous open index signature (which silently swept unrecognized string-valued keys into an internal `extra` bag, and silently dropped anything else) is removed -- a value must now be nested under a literal `metadata: {...}` key to be captured. See ADR 0035.
- 772d743: Fix `generateUsageReport()`'s `unconsumedOwnedVariables[].owner` ignoring a variable-level `owner` override when the contract has none set. It previously resolved ownership using only the contract's default `owner`, so a `documentEnv()` call setting `variables: { KEY: { owner: "..." } }` with no contract-level `owner` produced `owner: undefined` for that finding, disagreeing with the docs Catalog and ownership matrix (which already applied the variable-then-contract fallback correctly). `dependencyOwnership`/`abandonedContracts` are unaffected -- those are genuinely contract-level facts with no variable to override.
- 44fc5a0: Relocate the import-resolution modules (`resolve-import.ts`, `resolve-tsconfig-paths.ts`, `resolve-package-schema.ts`, `resolve-within-root.ts`) into a new `src/build/resolution/` subfolder, consolidating the `resolveImportSpecifier()` chokepoint (relative → alias → package resolution, ADR 0023/ADR 0014) into one cohesive location. Internal reorganization only -- `env-cap/build`'s public export names, types, and behavior are unchanged; verified byte-identical before/after. Prompted by `@maverickcer/data-cap` needing the same resolver design; see that package's `src/build/resolution/` for the ported copy.
- Replace `DependencyModelVariable.lines: readonly number[]` (and the underlying `AccessSite`/`VariableAccessInfo` shapes) with `positions: readonly SourcePosition[]`, a `{ file, line, column }` per access site instead of a bare, file-less line number -- closes a gap where a variable read from more than one file had no way to tell which file a given line number came from. `DEPENDENCY_MODEL_SCHEMA_VERSION` bumped 1 -> 2. See ADR 0036.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches 1.0. Before 1.0, minor versions may include breaking changes.

## [Unreleased]

- Build: **Experimental** TypeScript path-alias resolution -- a new `tsconfig`
  option (and CLI `--tsconfig <path>` / `--no-tsconfig`) on `generateEnvManifest()`/
  `generateDocumentation()`/`generateUsageReport()`/`generateEnvArtifacts()` resolves
  import specifiers written as `tsconfig.json` path aliases (`"@/lib/env"`) during
  static analysis, so a contract or `documentEnv()` call reached only through an alias
  isn't misreported as abandoned/unresolved in the manifest, docs, or Dependency &
  Ownership Report. Unlike `packages` (ADR 0014), this is on by default -- `tsconfig.json`
  at `root` is auto-detected, matching `tsc`'s own behavior, since a project's own
  tsconfig never crosses the trust/versioning boundary an installed package does. See
  [ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md) and
  [`VERSIONING.md`](VERSIONING.md) for the Experimental-surface policy this ships under.
  `examples/tsconfig-aliases` demonstrates it end to end, including the ownership-report
  false positive it fixes; `examples/tsconfig-aliases-consumer` additionally installs it as
  a real package (a real packed tarball, same shape as `examples/paypal-consumer`) to prove
  this composes correctly with cross-package discovery (ADR 0014) in one run.

## [0.1.0] - 2026-08-02

Initial release.

- Runtime: `createEnv()` / `validateEnv()` / `documentEnv()` -- capability-owned,
  lazily-resolved environment contracts with no global env object.
- Build: `generateEnvManifest()` / `generateDocumentation()` / `generateUsageReport()` /
  `generateEnvArtifacts()` -- static AST discovery and artifact generation, never
  importing or executing schema files.
- Helpers: `@maverickcer/env-cap/helpers` -- optional, tree-shakeable
  processor/validator convenience functions.
- CLI: `npx env-cap` for CI/release-pipeline artifact generation.
- CLI: a published JSON Schema for `--json` output (`schemas/env-cap-report.schema.json`,
  also exported as `@maverickcer/env-cap/schema`) for external, non-TypeScript
  tooling to validate or codegen against -- generated directly from
  `src/cli/json.ts`'s types, never hand-authored, so the two can't silently
  drift apart. See [ADR 0019](specs/decisions/0019-published-json-schema-generated-from-types.md).
- GitHub Action: a new `rotation-alert` input (default `true`) opens/updates a
  GitHub issue -- and auto-closes it once resolved -- when a run has no PR to
  comment on (a `schedule`/`workflow_dispatch`/plain-`push` trigger) and finds
  an expiring or expired variable, so a dormant repository still gets a real,
  emailed alert. See [ADR 0018](specs/decisions/0018-rotation-alert-issue-on-non-pr-runs.md).
- ESLint: new `@maverickcer/env-cap/eslint-plugin` subpath export, a
  `no-raw-process-env` rule that flags direct `process.env` access outside a
  capability's own `env.schema.ts`, with an `allow` glob-list escape hatch for
  legitimate build-time bootstrap code (e.g. a resolver reading a raw
  `VAULT_TOKEN` to authenticate to a secrets manager before any contract
  exists to go through). See [ADR 0017](specs/decisions/0017-eslint-plugin-entry-point.md).
- CLI: new `--check` flag verifies every requested artifact (manifest/docs/
  `.env.example`/ownership report) is up to date without writing anything --
  a CI drift guard for a schema change that forgot a local regeneration.
  `--json`'s envelope gains an additive `checkResult: { ok, stale }` field.
  See [ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md).
- CLI: a leading `⚠ N unresolved/dropped-schema warning(s) found` banner
  prints before the rest of a non-JSON run's output whenever a schema
  couldn't be statically resolved -- purely additive visibility, no change
  to exit-code semantics.
- Docs: SECURITY.md commits to a concrete post-1.0 security-backport policy (latest
  minor of the previous major, minimum six months after a new major ships, extendable
  but never shortened once stated) -- see
  [ADR 0015](specs/decisions/0015-security-backport-window.md).
- Build: `GenerateDocumentationResult.catalog` -- the full per-variable documentation
  content (description, owner, `expiresAt`, `extra` metadata, ...) alongside the
  existing `contracts` summary, keyed by variable name within each contract.
- CLI: `--json` flag emits a versioned, machine-readable report (`{ schemaVersion,
kind, toolVersion, ok, ... }`) instead of formatted text, for CI checks, PR
  annotations, and dashboards. Exit-code semantics are unchanged.
- GitHub Action: a first-party, dependency-free composite Action (`action.yml`) runs
  the CLI with `--json` and turns the result into inline PR annotations and a sticky
  summary comment.
- Build: **Experimental** cross-package schema discovery -- a new `packages`
  option (and CLI `--package <name>`, repeatable) on `generateEnvManifest()`/
  `generateDocumentation()`/`generateUsageReport()`/`generateEnvArtifacts()` lets a
  project discover a schema that ships inside a separately-published, installed
  package via an explicit allowlist, never an implicit scan of `node_modules`. See
  [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md) and
  [`VERSIONING.md`](VERSIONING.md) for the Experimental-surface policy this ships
  under. `examples/paypal-addon`/`examples/paypal-consumer` now demonstrate it
  against a real packed tarball, not a monorepo-sibling workaround.
- Docs: `GenerateUsageReportResult` gains `parseWarnings`, surfacing schema-discovery
  and package-resolution warnings from the `--ownership`/usage pass, matching the
  other two generators (purely additive; no `schemaVersion` bump per ADR 0013).
- New `VERSIONING.md` codifying the stable/Experimental/private semver scope, and
  `ADOPTION.md` synthesizing the security model, versioning stance, and migration
  cost for technical decision-makers.
- README: runtime support matrix, a Troubleshooting section keyed by exported error
  class, and a "Reusable packages" section documenting cross-package discovery.
- Specs: backfilled [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)
  (dependency-ownership engine's scope boundary) and
  [ADR 0011](specs/decisions/0011-shared-discovery-compute-atomic-write-non-atomic.md)
  (shared discovery, compute-atomic but not write-atomic `generateEnvArtifacts()`),
  both already-implemented decisions that were referenced by number but never
  written down until now.
- Governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
  `CODEOWNERS`, and tailored issue/PR templates.
- CI: GitHub Actions pinned to commit SHAs; Node matrix refreshed to currently
  maintained LTS lines (`18.x`/`22.x`/`24.x` required, `26.x` Current as a
  non-blocking signal) while `engines.node` stays `>=18.0.0`, unchanged, since
  nothing in the code requires newer; a new cross-runtime job runs the same
  conformance suite under Bun and Deno's own native test runners, not just
  Node/vitest; an `examples` job installs and typechecks/runs all seven
  reference examples against the real, just-built package.
- Adopted `@typescript-eslint`'s `strict-type-checked` + `stylistic-type-checked`
  ESLint configuration (`npm run lint`, its own step in CI) with
  every finding fixed or explicitly, narrowly justified -- including two real bugs
  this caught: an untyped `new Map()` fallback that silently widened a chain of
  values to `any`, and `EnvContract`'s type not declaring the `toString()` override
  `create.ts` actually implements.
- `vitest.config.ts` now enforces coverage thresholds (lines/branches/functions/
  statements) in CI, not just locally informational reporting.
- Runtime/build error classes (`EnvValidationError`, `EnvNotReadyError`,
  `EnvManifestGenerationError`, `EnvDocumentationGenerationError`,
  `EnvUsageAnalysisError`, `EnvProjectGenerationError`) gain a stable, Stable-tier
  `code` field for programmatic handling that doesn't depend on `.name`/`instanceof`.
- Release: adopted [Changesets](https://github.com/changesets/changesets) plus a
  new `release.yml` workflow publishing via npm's OIDC trusted publishing -- no
  `NPM_TOKEN` secret, provenance-attested by default. See `CONTRIBUTING.md`'s
  release-process section for the one-time, human-only npmjs.com setup step this
  requires.
- Website: dark mode (follows `prefers-color-scheme`, overridable via a new header
  toggle, persisted); a dependency-free `Cmd+K`/`Ctrl+K` search over the page's own
  sections and FAQ entries; an `aria-live` announcement for the copy-button
  confirmation; a fixed borderline (~4.55:1) muted-text contrast token to ~7.2-7.6:1;
  named links to specific ADRs from the Security and Adoption sections instead of a
  generic repository link; `sitemap.xml` plus a `Sitemap:` line in `robots.txt`;
  a Getting Started mention of the ESLint plugin and `--json`/`--check`; removed
  several leftover, never-referenced CSS classes (`.card`, `.callout--warning`,
  `.callout--success`, `.comparison-table .is-positive`).

[Unreleased]: https://github.com/maverickcer/env-cap/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/maverickcer/env-cap/releases/tag/v0.1.0
