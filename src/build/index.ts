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

export type { CompatibilityIssue } from "./compatibility.js"
export {
  EnvDocumentationGenerationError,
  EnvManifestGenerationError,
  EnvProjectGenerationError,
  EnvUsageAnalysisError,
} from "./errors.js"
export type { DiscoveredContractSummary } from "./link.js"

// Lower-level building blocks, exposed for custom tooling (bundler plugins, CI scripts).
export { detectCompatibilityIssues } from "./compatibility.js"
export { discoverSchemaFiles } from "./discover.js"
export { computeExpiringEntries, extractPreviouslyDocumentedKeys, renderDocs } from "./docs.js"
export type {
  ExpiringEntry,
  RenderDocsOptions,
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
export { detectExclusiveGroupIssues } from "./exclusive-group.js"
export { linkFiles } from "./link.js"
export type { DiscoveredContract, DiscoveredVariable, LinkResult, UnresolvedLink } from "./link.js"
export {
  applyLiveExpirationOverrides,
  collectVariableNames,
  resolveLiveExpirationDates,
} from "./live-expirations.js"
export type { LiveExpirationDates } from "./live-expirations.js"
export { renderManifest } from "./manifest.js"
export { extractContractDocs, extractSchemaVariables, parseSchemaFile } from "./parse.js"
export type {
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
