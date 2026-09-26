/**
 * env-cap build-time entry point (`env-cap/build`).
 *
 * Discovery, static analysis, cross-file linking, and manifest/docs/
 * ownership-report generation only -- this module imports `node:path` and
 * (indirectly) `typescript`, and must never be imported from runtime/
 * browser/edge code. It has no knowledge of `createEnv`/`documentEnv`/
 * `validateEnv` and performs no environment validation, and never executes a
 * discovered schema file.
 *
 * It never imports `node:fs` (ADR 0040): `./build` is a library surface, so
 * the caller supplies the filesystem capability. Every public options object
 * below carries a required `fs: BuildFileSystem` field; the `env-cap` CLI
 * builds a concrete `node:fs/promises` adapter and hands it in. A consumer
 * running these functions from their own Node build script imports the same
 * adapter from `env-cap/node` (`{ nodeBuildFileSystem }`).
 *
 * The public API is deliberately curated: four generator functions
 * (`generateEnvManifest`, `generateDocumentation`, `generateUsageReport`,
 * `generateEnvArtifacts`) plus the lower-level discovery/linking primitives,
 * justified by real external use (custom CI scripts, bundler plugins) and
 * promoted to Stable alongside the orchestrators per ADR 0045 -- see
 * VERSIONING.md. The dependency-ownership engine's internals (scanning,
 * graph-building, derivation) are intentionally NOT exported here -- see ADR
 * 0010 and ADR 0011. `env-cap` answers ownership/visibility questions; it
 * doesn't ship a general-purpose static-analysis toolkit. The scanner
 * follows object-destructuring and one level of file-unique `const`
 * aliasing, and records every other shape as an explicit `escape` (ADR
 * 0039); a variable on an escaped contract is `indeterminate`, never a false
 * `unconsumed`, and the finding's `reason` cites every escape site.
 *
 * Each generator also accepts a `packages` option (an explicit
 * allowlist of installed package names) for discovering a schema that ships
 * inside a separately-published dependency rather than the project's own
 * source tree -- see ADR 0014 and VERSIONING.md.
 *
 * Each generator also accepts a `tsconfig` option for resolving
 * import specifiers written as TypeScript path aliases (e.g. `"@/lib/env"`)
 * against a project's own `tsconfig.json` `paths`/`baseUrl` during static
 * analysis. Unlike `packages`, this is on by default (auto-detecting
 * `tsconfig.json` at `root`) since it never crosses a trust/versioning
 * boundary -- see ADR 0023 and VERSIONING.md.
 */

// Orchestrators -- the entire public build API.
export { checkEnvArtifacts } from "./check-artifacts.js"
export type { ArtifactCheckFinding, CheckEnvArtifactsResult } from "./check-artifacts.js"
export { generateDocumentation } from "./generate-documentation.js"
export {
  STANDARD_SENSITIVITY_LEVELS,
  type DocumentationFindings,
  type GenerateDocumentationOptions,
  type GenerateDocumentationResult,
  type NonstandardSensitivityEntry,
} from "./generate-documentation.js"
export { generateEnvArtifacts } from "./generate-env-artifacts.js"
export type {
  GenerateEnvArtifactsOptions,
  GenerateEnvArtifactsResult,
} from "./generate-env-artifacts.js"
export { generateEnvManifest } from "./generate-manifest.js"
export type { GenerateEnvManifestOptions, GenerateEnvManifestResult } from "./generate-manifest.js"
// The persisted evidence artifact (ADR 0038) -- not a sibling of
// env.manifest.ts (see evidence-snapshot.ts's own module doc comment). Only
// the shape a consumer needs to annotate `EvidenceModel.change`/a custom
// diff of two evidence snapshots is public; the read/write/diff functions
// themselves stay internal (used by `computeArtifacts()`/`getEvidenceModel()`),
// matching ADR 0010's precedent of keeping engine internals private until a
// primitive earns Experimental-public status through real external use.
export type {
  ManifestChangeReport,
  ManifestContractRef,
  ManifestContractUpdate,
  ManifestFieldChange,
  ManifestVariableRef,
  ManifestVariableUpdate,
} from "./evidence-snapshot.js"
// A fast, cache-aware read path for the persisted evidence artifact,
// like `generateEvidenceModel()` itself. See ADR 0038.
export { computeSourceFingerprint, getEvidenceModel } from "./evidence-cache.js"
export type {
  ComputeSourceFingerprintOptions,
  GetEvidenceModelOptions,
  GetEvidenceModelResult,
} from "./evidence-cache.js"
export { generateUsageReport } from "./generate-usage.js"
export type { GenerateUsageReportOptions, GenerateUsageReportResult } from "./generate-usage.js"
// Finding/entry shapes are defined in usage-report.ts (the renderer), not
// generate-usage.ts (the orchestrator) -- see RenderUsageReportOptions's own
// doc comment for why, mirroring docs.ts's CatalogContract/ExpiringEntry
// below. `renderUsageReport()` itself is exported, mirroring
// `renderDocs()` -- a pure formatter over these
// already-public finding types, not the AST-scanning engine ADR 0010
// restricts; a consumer (a custom evidence projection, e.g.) can render the
// exact same Markdown env-cap's own `--ownership` output produces. See ADR
// 0038.
export {
  renderUsageReport,
  type AbandonedContractFinding,
  type AssertedDynamicAccessFinding,
  type IndeterminateOwnershipFinding,
  type OwnershipDependencyEntry,
  type RenderUsageReportOptions,
  type UnconsumedOwnedVariableFinding,
  type UnresolvedConsumerFinding,
} from "./usage-report.js"
// The stale/missing dynamic-access-citation shape `staleOrMissingCitations`
// (on `UnconsumedOwnedVariableFinding`/`IndeterminateOwnershipFinding`)
// carries -- see ADR 0037/ADR 0038.
export type { DynamicAccessCitationProblem } from "./citation-verification.js"

export type { CompatibilityIssue, CompatibilityIssueCode } from "./compatibility.js"
export {
  EnvDocumentationGenerationError,
  EnvManifestGenerationError,
  EnvProjectGenerationError,
  EnvUsageAnalysisError,
} from "./errors.js"
export type { DiscoveredContractSummary } from "./link.js"

// Lower-level building blocks, exposed for custom tooling (bundler plugins, CI scripts).
// The Change Model (ADR 0024, ADR 0030) -- wraps the existing
// ManifestChangeReport in a versioned, model-namespaced shape. See ADR 0021
// for the change report itself, unchanged here.
export { buildChangeModel, CHANGE_MODEL_SCHEMA_VERSION } from "./change-model.js"
export type { ChangeModel, RenamedVariable } from "./change-model.js"
export { detectCompatibilityIssues, detectDuplicateVariableShapes } from "./compatibility.js"
// Root-relative, POSIX-separated path rendering -- the one conversion every
// model builder and renderer in this package shares, exposed so custom
// tooling building its own artifact alongside env-cap's renders paths the
// same way rather than reimplementing the `../`-escape rule.
export { displayPath } from "./display-path.js"
// SARIF 2.1.0 export (FEA-03) -- a pure adapter over Finding Model, so
// env-cap's findings drop into GitHub code scanning and CI security
// dashboards with no bespoke integration.
export { buildSarifLog } from "./sarif.js"
export type { SarifLog } from "./sarif.js"
// env-cap's own built-in reference projections, declared through the public
// `defineEvidenceProjection()` -- see `reference-projections.ts`.
export {
  configurationReference,
  expiringSoonReport,
  groupVariablesByOwner,
  ownershipSummary,
} from "./reference-projections.js"
export type {
  ConfigurationReference,
  ConfigurationReferenceEntry,
  ExpiringSoonEntry,
  ExpiringSoonReport,
  OwnerBearingContract,
  OwnershipSummary,
  OwnershipSummaryEntry,
} from "./reference-projections.js"
// The Contract Model (ADR 0024, ADR 0025) -- the first of env-cap's seven
// canonical fact models. A versioned, JSON-serializable superset of
// DiscoveredContract/DiscoveredVariable (below), including every discovered
// contract regardless of `active`.
export { buildContractModel, CONTRACT_MODEL_SCHEMA_VERSION } from "./contract-model.js"
export type {
  ContractModel,
  ContractModelContract,
  ContractModelVariable,
} from "./contract-model.js"
// A generic recursive deep-freeze, genericized from live-expirations.ts's
// former DiscoveredContract[]-hardcoded version -- Evidence Model (a later
// phase, ADR 0024) reuses this for its own immutability guarantee.
export { deepFreeze } from "./deep-freeze.js"
// The Dependency Model (ADR 0024, ADR 0027) -- a fact-shaped result of the
// dependency-ownership engine, including the inverse file->contracts index
// and per-access-site line numbers neither `dependency-graph.ts` (Private,
// unchanged, per ADR 0010) nor `usage-report.ts` exposes today.
export { buildDependencyModel, DEPENDENCY_MODEL_SCHEMA_VERSION } from "./dependency-model.js"
export type {
  DependencyModel,
  DependencyModelConsumer,
  DependencyModelContract,
  DependencyModelContractRef,
  DependencyModelVariable,
} from "./dependency-model.js"
// Only this status-vocabulary type and ScannedSurface, needed to name
// DependencyModelVariable.status and DependencyModel.scannedSurfaces --
// every function in dependency-graph.ts stays unexported, per ADR 0010.
export type { ScannedSurface, VariableAccessStatus } from "./dependency-graph.js"
// SourcePosition/DynamicAccessAssertion (ADR 0036/ADR 0037) -- named here so
// a consumer can annotate ContractModelContract.declaration/documentation,
// ContractModelVariable.declaration, DependencyModelContract.dynamicAccessSites,
// and DependencyModelVariable.positions/dynamicAccessAssertions, every one of
// which already carries this shape.
export { discoverSchemaFiles } from "./discover.js"
export {
  computeExpiringEntries,
  computeSecurityReviewCounters,
  extractPreviouslyDocumentedKeys,
  renderDocs,
} from "./docs.js"
export type {
  ExpiringEntry,
  RenderDocsOptions,
  SecurityReviewCounters,
  UndocumentedContractRef,
  UndocumentedVariableRef,
} from "./docs.js"
export {
  computeReconciliation,
  extractCommentedVariables,
  extractDeclaredVariables,
  renderEnvExample,
  writeEnvExample,
} from "./env-example.js"
export type { EnvExampleOnExisting, EnvExampleResult, Reconciliation } from "./env-example.js"
export type { DynamicAccessAssertion, SourcePosition } from "./source-position.js"
// The Evidence Model (ADR 0024, ADR 0031) -- the assembled union of the
// other six models plus provenance. This shape is also consumed (type-only)
// by `env-cap/evidence`.
export { EVIDENCE_MODEL_SCHEMA_VERSION } from "./evidence-model.js"
export type { EvidenceModel, EvidenceProvenance } from "./evidence-model.js"
// generateEvidenceModel() runs discovery once and assembles all
// seven canonical fact models by calling each one's own builder directly.
// Unlike the four orchestrators above, it never throws for a data-quality
// finding by design -- every one becomes a `Finding` instead (see ADR 0031);
// that is this function's permanent, intended shape, not a gap to close.
export { generateEvidenceModel } from "./generate-evidence.js"
export type { GenerateEvidenceModelOptions } from "./generate-evidence.js"
// The Finding Model (ADR 0024, ADR 0026) -- unifies CompatibilityIssue,
// ArtifactCheckFinding, DocumentationFindings, and the usage-report ownership
// findings behind one shape, with a required `code` and a structured
// EvidenceReference `location` instead of four independently-shaped families.
export type {
  ChangeEvidenceReference,
  ContractEvidenceReference,
  ContractRef,
  EvidenceReference,
  OwnershipEvidenceReference,
} from "./evidence-reference.js"
export { detectExclusiveGroupIssues } from "./exclusive-group.js"
export { buildFindingModel, FINDING_MODEL_SCHEMA_VERSION } from "./finding-model.js"
export type {
  BuildFindingModelInput,
  Finding,
  FindingCode,
  FindingFamily,
  FindingModel,
} from "./finding-model.js"
// The Lifecycle Model (ADR 0024, ADR 0029) -- promotes ExpiringEntry/
// computeExpiringEntries() into a canonical, versioned shape alongside the
// new deprecated/deprecatedReason/removeBy/renamedFrom fields.
export { buildLifecycleModel, LIFECYCLE_MODEL_SCHEMA_VERSION } from "./lifecycle-model.js"
export type {
  LifecycleModel,
  LifecycleModelContract,
  LifecycleModelVariable,
} from "./lifecycle-model.js"
export { effectiveOwner, linkFiles } from "./link.js"
export type { DiscoveredContract, DiscoveredVariable, LinkResult, UnresolvedLink } from "./link.js"
export {
  applyLiveExpirationOverrides,
  collectVariableNames,
  resolveLiveExpirationDates,
} from "./live-expirations.js"
export type { LiveExpirationDates } from "./live-expirations.js"
export { renderManifest } from "./manifest.js"
// The Ownership Model (ADR 0024, ADR 0028) -- effective owner per
// contract/variable, plus first-class unownedContracts/unownedVariables
// arrays (previously only a count inside renderSecurityReview()'s text).
export { buildOwnershipModel, OWNERSHIP_MODEL_SCHEMA_VERSION } from "./ownership-model.js"
export type {
  OwnershipModel,
  OwnershipModelContract,
  OwnershipModelContractRef,
  OwnershipModelVariable,
  OwnershipModelVariableRef,
} from "./ownership-model.js"
export { extractContractDocs, extractSchemaVariables, parseSchemaFile } from "./parse.js"
export type {
  DiscoveredContractDocs,
  DiscoveredSchemaVariable,
  DiscoveredVariableDocs,
  DiscoveredVariableEvidence,
  FileParseResult,
  ImportBinding,
  ParseWarning,
  SchemaRef,
} from "./parse.js"
export { resolveRelativeImport } from "./resolution/resolve-import.js"
// Cross-package schema discovery (see ADR 0014 and VERSIONING.md).
// Only the `packages` option (above, on each generator's options type) and
// the `PackageOrigin` shape it attaches to `DiscoveredContract` are public --
// resolution internals (`resolvePackageSchemaFile`, `resolveAllowlistedPackages`,
// `resolveImportSpecifier`, `resolvePackageImport`, `mergeLocalAndPackageFiles`)
// are deliberately not exported, matching ADR 0010's precedent for keeping
// analysis-engine internals out of the public surface.
export type { PackageOrigin } from "./resolution/resolve-package-schema.js"

// The filesystem capability every `./build` options object requires -- see
// `types.ts` and ADR 0040. `./build` never imports `node:fs`; the caller
// (the `env-cap` CLI, or a test) supplies a concrete adapter.
export type { BuildDirent, BuildFileSystem, BuildStats } from "./types.js"
// env-cap's own installed version (a build-time constant, ADR 0040) -- the
// CLI's `--json` envelope reuses this rather than reading `package.json`.
export { readToolVersion } from "./tool-version.js"
