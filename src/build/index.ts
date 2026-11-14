/**
 * The build entry point (`@maverickcer/env-cap/build`): find every contract in a project and write the
 * files built from them. Those are the manifest, the environment docs, `.env.example`, the ownership
 * report and the evidence file.
 *
 * Run it from a build script or CI, never from application code. It parses schema files as TypeScript
 * syntax trees and never imports or runs them. Only literal values resolve; anything dynamic becomes a
 * warning, never a guess. It imports `node:path` and a TypeScript compiler, but never `node:fs`
 * (ADR 0040). So every options object takes a required `fs: BuildFileSystem`. Node build scripts pass
 * `nodeBuildFileSystem` from `@maverickcer/env-cap/node`, the same adapter the `env-cap` CLI uses.
 *
 * Four orchestrators cover most uses: `generateEnvManifest`, `generateDocumentation`,
 * `generateUsageReport` and `generateEnvArtifacts`. The lower-level discovery and linking primitives
 * serve custom CI scripts and bundler plugins. Both groups are Stable (ADR 0045, `VERSIONING.md`).
 * The ownership engine's scanning, graph and derivation internals stay unexported (ADR 0010, ADR 0011).
 *
 * The usage scanner follows object destructuring and one level of file-unique `const` aliasing. It
 * records every other access shape as an `escape` (ADR 0039). A variable on an escaped contract is
 * `indeterminate`, never a false `unconsumed`, and the finding's `reason` cites every escape site.
 *
 * Each generator also takes two discovery options. `packages` is an allowlist of installed packages
 * whose published schema it reads (ADR 0014). `tsconfig` resolves path aliases such as `"@/lib/env"`
 * from the project's `tsconfig.json`; it is on by default because it never crosses a package
 * boundary (ADR 0023).
 *
 * @packageDocumentation
 */

// Orchestrators: the entire public build API.
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
// The persisted evidence artifact (ADR 0038): not a sibling of
// env.manifest.ts (see evidence-snapshot.ts's own module doc comment). Only
// the shape a consumer needs to annotate `EvidenceModel.change`/a custom
// diff of two evidence snapshots is public. The read/write/diff functions
// stay internal (used by `computeArtifacts()`/`getEvidenceModel()`). That
// follows ADR 0010: engine internals stay private until a primitive earns
// Experimental-public status through real external use.
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
// generate-usage.ts (the orchestrator). RenderUsageReportOptions's own doc
// comment says why; docs.ts's CatalogContract/ExpiringEntry below follow the
// same rule. `renderUsageReport()` itself is exported, like `renderDocs()`.
// It is a pure formatter over these already-public finding types, not the
// AST-scanning engine ADR 0010 restricts. So a consumer (e.g. a custom
// evidence projection) can render the same Markdown as env-cap's
// `generateUsageReport()`. See ADR 0038.
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
// carries: see ADR 0037/ADR 0038.
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
// The Change Model (ADR 0024, ADR 0030): wraps the existing
// ManifestChangeReport in a versioned, model-namespaced shape. See ADR 0021
// for the change report itself, unchanged here.
export { buildChangeModel, CHANGE_MODEL_SCHEMA_VERSION } from "./change-model.js"
export type { ChangeModel, RenamedVariable } from "./change-model.js"
export { detectCompatibilityIssues, detectDuplicateVariableShapes } from "./compatibility.js"
// Root-relative, POSIX-separated path rendering: the one conversion every
// model builder and renderer in this package shares. It is exported so
// custom tooling that builds its own artifact renders paths the same way,
// without reimplementing the `../`-escape rule.
export { displayPath } from "./display-path.js"
// SARIF 2.1.0 export: a pure adapter over the Finding Model, so GitHub code
// scanning can read env-cap's findings.
export { buildSarifLog } from "./sarif.js"
export type { SarifLog } from "./sarif.js"
// env-cap's own built-in reference projections, declared through the public
// `defineEvidenceProjection()`: see `reference-projections.ts`.
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
// The Contract Model (ADR 0024, ADR 0025): the first of env-cap's seven
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
// former DiscoveredContract[]-hardcoded version: Evidence Model (a later
// phase, ADR 0024) reuses this for its own immutability guarantee.
export { deepFreeze } from "./deep-freeze.js"
// The Dependency Model (ADR 0024, ADR 0027): a fact-shaped result of the
// dependency-ownership engine. It includes the inverse file->contracts index
// and per-access-site line numbers. Neither `dependency-graph.ts` (Private,
// per ADR 0010) nor `usage-report.ts` exposes those.
export { buildDependencyModel, DEPENDENCY_MODEL_SCHEMA_VERSION } from "./dependency-model.js"
export type {
  DependencyModel,
  DependencyModelConsumer,
  DependencyModelContract,
  DependencyModelContractRef,
  DependencyModelVariable,
} from "./dependency-model.js"
// Only this status-vocabulary type and ScannedSurface, needed to name
// DependencyModelVariable.status and DependencyModel.scannedSurfaces:
// every function in dependency-graph.ts stays unexported, per ADR 0010.
export type { ScannedSurface, VariableAccessStatus } from "./dependency-graph.js"
// SourcePosition/DynamicAccessAssertion (ADR 0036/ADR 0037): named here so
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
// The Evidence Model (ADR 0024, ADR 0031): the assembled union of the
// other six models plus provenance. This shape is also consumed (type-only)
// by `@maverickcer/env-cap/evidence`.
export { EVIDENCE_MODEL_SCHEMA_VERSION } from "./evidence-model.js"
export type { EvidenceModel, EvidenceProvenance } from "./evidence-model.js"
// generateEvidenceModel() runs discovery once and assembles all
// seven canonical fact models by calling each one's own builder directly.
// Unlike the four orchestrators above, it never throws for a data-quality
// finding, by design. Every one becomes a `Finding` instead (see ADR 0031).
// That is this function's intended shape, not a gap to close.
export { generateEvidenceModel } from "./generate-evidence.js"
export type { GenerateEvidenceModelOptions } from "./generate-evidence.js"
// The Finding Model (ADR 0024, ADR 0026): one shape for CompatibilityIssue,
// ArtifactCheckFinding, DocumentationFindings, and the usage-report ownership
// findings. It has a required `code` and a structured EvidenceReference
// `location`, instead of four independently-shaped families.
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
// The Lifecycle Model (ADR 0024, ADR 0029): promotes ExpiringEntry/
// computeExpiringEntries() into a canonical, versioned shape alongside the
// new deprecated/deprecatedReason/removeBy/renamedFrom fields.
export {
  buildLifecycleModel,
  computeRotationStatus,
  LIFECYCLE_MODEL_SCHEMA_VERSION,
  parseRotationPeriodDays,
} from "./lifecycle-model.js"
export type {
  LifecycleModel,
  LifecycleModelContract,
  LifecycleModelVariable,
  RotationComplianceStatus,
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
// The Ownership Model (ADR 0024, ADR 0028): the effective owner per
// contract and variable. The unowned lists are arrays, not a count in report
// text, so a caller can name each unowned item.
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
// the `PackageOrigin` shape it attaches to `DiscoveredContract` are public.
// Resolution internals (`resolvePackageSchemaFile`, `resolveAllowlistedPackages`,
// `resolveImportSpecifier`, `resolvePackageImport`, `mergeLocalAndPackageFiles`)
// are deliberately not exported. ADR 0010 keeps analysis-engine internals out
// of the public surface.
export type { PackageOrigin } from "./resolution/resolve-package-schema.js"

// The filesystem capability every `./build` options object requires: see
// `types.ts` and ADR 0040. `./build` never imports `node:fs`; the caller
// (the `env-cap` CLI, or a test) supplies a concrete adapter.
export type { BuildDirent, BuildFileSystem, BuildStats } from "./types.js"
// env-cap's own installed version (a build-time constant, ADR 0040): the
// CLI's `--json` envelope reuses this rather than reading `package.json`.
export { readToolVersion } from "./tool-version.js"
