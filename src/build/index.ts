/**
 * env-cap build-time entry point (`env-cap/build`).
 *
 * Discovery, static analysis, cross-file linking, and manifest/docs/
 * ownership-report generation only -- this module imports `node:fs`,
 * `node:path`, and (indirectly) `typescript`, and must never be imported
 * from runtime/browser/edge code. It has no knowledge of `createEnv`/
 * `documentEnv`/`validateEnv` and performs no environment validation, and
 * never executes a discovered schema file.
 *
 * The public API is deliberately curated: four generator functions
 * (`generateEnvManifest`, `generateDocumentation`, `generateUsageReport`,
 * `generateEnvArtifacts`) -- Stable, per VERSIONING.md -- plus the
 * lower-level discovery/linking primitives already justified by real
 * external use (custom CI scripts, bundler plugins). Those primitives are
 * Experimental, not Stable, until each has been through a real feedback
 * cycle on its own (see VERSIONING.md's Experimental tier). The
 * dependency-ownership engine's internals (scanning, graph-building,
 * derivation) are intentionally NOT exported here -- see ADR 0010 and ADR
 * 0011. `env-cap` answers ownership/visibility questions; it doesn't ship a
 * general-purpose static-analysis toolkit.
 *
 * Each generator also accepts an Experimental `packages` option (an explicit
 * allowlist of installed package names) for discovering a schema that ships
 * inside a separately-published dependency rather than the project's own
 * source tree -- see ADR 0014 and VERSIONING.md.
 *
 * Each generator also accepts an Experimental `tsconfig` option for resolving
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
export type {
  DocumentationFindings,
  GenerateDocumentationOptions,
  GenerateDocumentationResult,
} from "./generate-documentation.js"
export { generateEnvArtifacts } from "./generate-env-artifacts.js"
export type {
  GenerateEnvArtifactsOptions,
  GenerateEnvArtifactsResult,
} from "./generate-env-artifacts.js"
export { generateEnvManifest } from "./generate-manifest.js"
export type { GenerateEnvManifestOptions, GenerateEnvManifestResult } from "./generate-manifest.js"
// Only the shape a consumer needs to annotate `result.manifest.changes` (see ADR 0021) --
// manifest-snapshot.ts's build/read/write/diff functions and its on-disk `ManifestSnapshot*`
// shapes stay internal, matching ADR 0010's precedent of keeping engine internals private
// until a primitive earns Experimental-public status through real external use.
export type {
  ManifestChangeReport,
  ManifestContractRef,
  ManifestContractUpdate,
  ManifestFieldChange,
  ManifestVariableRef,
  ManifestVariableUpdate,
} from "./manifest-snapshot.js"
export { generateUsageReport } from "./generate-usage.js"
export type { GenerateUsageReportOptions, GenerateUsageReportResult } from "./generate-usage.js"
// Finding/entry shapes are defined in usage-report.ts (the renderer), not
// generate-usage.ts (the orchestrator) -- see RenderUsageReportOptions's own
// doc comment for why, mirroring docs.ts's CatalogContract/ExpiringEntry
// below.
export type {
  AbandonedContractFinding,
  IndeterminateOwnershipFinding,
  OwnershipDependencyEntry,
  UnconsumedOwnedVariableFinding,
  UnresolvedConsumerFinding,
} from "./usage-report.js"

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
export { detectCompatibilityIssues } from "./compatibility.js"
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
// Only this one status-vocabulary type, needed to name
// DependencyModelVariable.status -- every function in dependency-graph.ts
// stays unexported, per ADR 0010.
export type { VariableAccessStatus } from "./dependency-graph.js"
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
// The Evidence Model (ADR 0024, ADR 0031) -- the assembled union of the
// other six models plus provenance. `generateEvidenceModel()` (a later
// phase) is what actually produces one; this is only the shape, also
// consumed (type-only) by `@maverickcer/env-cap/evidence`.
export type { EvidenceModel, EvidenceProvenance } from "./evidence-model.js"
export { EVIDENCE_MODEL_SCHEMA_VERSION } from "./evidence-model.js"
// The Finding Model (ADR 0024, ADR 0026) -- unifies CompatibilityIssue,
// ArtifactCheckFinding, DocumentationFindings, and the usage-report ownership
// findings behind one shape, with a required `code` and a structured
// EvidenceReference `location` instead of four independently-shaped families.
export type {
  ChangeEvidenceReference,
  ContractEvidenceReference,
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
  DiscoveredClassification,
  DiscoveredContractDocs,
  DiscoveredSchemaVariable,
  DiscoveredVariableDocs,
  FileParseResult,
  ImportBinding,
  ParseWarning,
  SchemaRef,
} from "./parse.js"
export { resolveRelativeImport } from "./resolve-import.js"
// Cross-package schema discovery (Experimental -- see ADR 0014 and VERSIONING.md).
// Only the `packages` option (above, on each generator's options type) and
// the `PackageOrigin` shape it attaches to `DiscoveredContract` are public --
// resolution internals (`resolvePackageSchemaFile`, `resolveAllowlistedPackages`,
// `resolveImportSpecifier`, `resolvePackageImport`, `mergeLocalAndPackageFiles`)
// are deliberately not exported, matching ADR 0010's precedent for keeping
// analysis-engine internals out of the public surface.
export type { PackageOrigin } from "./resolve-package-schema.js"
